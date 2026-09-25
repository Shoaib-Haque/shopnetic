import { Injectable } from '@nestjs/common';
import type { Actor } from '@shopnetic/auth';
import type {
  AddOptionValueRequest,
  CreateOptionTypeRequest,
  OptionType,
  UpdateOptionTypeRequest,
  UpdateOptionValueRequest,
} from '@shopnetic/contracts';
import { Prisma } from '@shopnetic/db';
import type { OptionType as OptionTypeRow, OptionValue as OptionValueRow } from '@shopnetic/db';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppError } from '../common/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import { auditRecordFor } from '../audit/audit-record-for.js';
import {
  tokenizeForSql,
  buildTokenSearch,
  rankedOffsetFromCursor,
  rankedNextCursor,
} from '../common/text-search.js';
import { clampLimit } from '../common/pagination.js';
import type { RequestMeta } from '../identity/identity.service.js';
import { writeCatalogOutbox } from './catalog-outbox.js';

type OptionTypeWithValues = OptionTypeRow & { values: OptionValueRow[] };

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

/**
 * Global option-type catalog (plan/26 section 3). Option types + their allowed values,
 * reusable across categories. Per-category behaviour (`is_variant_axis`,
 * `value_source`, …) is configured later in `category_option`.
 */
@Injectable()
export class OptionTypeService {
  private readonly record: ReturnType<typeof auditRecordFor>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {
    this.record = auditRecordFor(this.audit, 'option_type');
  }

  async list(opts: {
    status?: OptionType['status'];
    /** List archived (soft-deleted) rows instead of live ones — the only
     * way back to a row once its delete's undo-toast window has passed
     * (mirrors `BrandService.list()`'s own field). */
    archived?: boolean;
    q?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ items: OptionType[]; nextCursor?: string }> {
    // Cursor-paginated, same shape as Brand/Staff/Audit Log — was a
    // plain unpaginated array (option types were expected to stay a small,
    // bounded set; 70+ real ones later proved otherwise). `code` is the
    // keyset cursor, not `id`: it's already the list's display order
    // (`ORDER BY code ASC`) and is DB-unique, so it's a safe boundary on
    // its own — no need to fall back to `id` the way a non-unique sort
    // column would.
    const limit = clampLimit(opts.limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT);

    // Same shared multi-token, relevance-ranked search as Category/Brand/
    // Staff/Audit Log (`../common/text-search.js`) — was previously
    // `code`-only, unranked, so "FX 47"-style multi-word queries never
    // ranked the fuller match first and never matched on name at all.
    const tokens = opts.q ? tokenizeForSql(opts.q) : [];
    const isSearch = tokens.length > 0;

    const params: unknown[] = [];
    const where = [opts.archived ? 'deleted_at IS NOT NULL' : 'deleted_at IS NULL'];
    let scoreExpr = '0';
    if (opts.status) {
      params.push(opts.status);
      where.push(`status::text = $${params.length}`);
    }
    if (isSearch) {
      const { whereSql, scoreSql } = buildTokenSearch(
        tokens,
        `lower(coalesce(name_i18n->>'en', '') || ' ' || code)`,
        params,
      );
      where.push(whereSql);
      scoreExpr = scoreSql;
    }
    if (opts.cursor && !isSearch) {
      params.push(opts.cursor);
      where.push(`code > $${params.length}`);
    }

    const offset = isSearch ? rankedOffsetFromCursor(opts.cursor) : 0;
    const idRows = await this.prisma.$queryRawUnsafe<{ id: string; code: string }[]>(
      `SELECT id, code
         FROM catalog.option_type
        WHERE ${where.join(' AND ')}
        ORDER BY ${isSearch ? `${scoreExpr} DESC, ` : ''}code ASC
        LIMIT ${limit + 1}${isSearch ? ` OFFSET ${offset}` : ''}`,
      ...params,
    );

    const page = idRows.slice(0, limit);
    const keysetCursor = idRows.length > limit ? page.at(-1)?.code : undefined;
    const nextCursor = isSearch ? rankedNextCursor(idRows.length, limit, offset) : keysetCursor;

    const orderedIds = page.map((r) => r.id);
    const rows = orderedIds.length
      ? await this.prisma.optionType.findMany({
          where: { id: { in: orderedIds } },
          include: { values: true },
        })
      : [];
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered = orderedIds.flatMap((id) => {
      const row = byId.get(id);
      return row ? [row] : [];
    });
    return { items: ordered.map(toView), ...(nextCursor ? { nextCursor } : {}) };
  }

  async get(id: string): Promise<OptionType> {
    return toView(await this.rowOrThrow(id));
  }

  async create(
    input: CreateOptionTypeRequest,
    actor: Actor,
    meta: RequestMeta,
  ): Promise<OptionType> {
    await this.assertCodeFree(input.code, null);
    await this.assertNameFree(input.name['en'] ?? '', null);
    const values = dedupeByCode(input.values ?? []);
    assertLabelsDistinct(values);

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.optionType.create({
        data: {
          code: input.code,
          nameI18n: input.name,
          ...(input.dataType ? { dataType: input.dataType } : {}),
          ...(input.hasSwatch !== undefined ? { hasSwatch: input.hasSwatch } : {}),
          values: {
            create: values.map((v, i) => ({
              code: v.code,
              labelI18n: v.label,
              swatchHex: v.swatchHex ?? null,
              swatchImageKey: v.swatchImageKey ?? null,
              position: v.position ?? i,
            })),
          },
        },
        include: { values: true },
      });
      await writeCatalogOutbox(tx, 'option_type', 'option_type.created', row.id, {
        id: row.id,
        code: row.code,
        valueCount: row.values.length,
      });
      return row;
    });

    await this.record(actor, 'catalog.option_type_created', created.id, meta, {
      after: toView(created),
    });
    return toView(created);
  }

  async update(
    id: string,
    input: UpdateOptionTypeRequest,
    actor: Actor,
    meta: RequestMeta,
  ): Promise<OptionType> {
    const current = await this.rowOrThrow(id);

    // optimistic concurrency: reject a save built on a stale view of the
    // row — mirrors `BrandService.update()`'s/`CategoryService.update()`'s
    // own guard, same risk (concurrent edits by multiple staff), same fix.
    if (
      input.expectedUpdatedAt !== undefined &&
      input.expectedUpdatedAt !== current.updatedAt.toISOString()
    ) {
      throw new AppError('CONFLICT', 409, { detail: 'option type changed since it was loaded' });
    }

    if (input.code && input.code !== current.code) await this.assertCodeFree(input.code, id);
    if (input.name !== undefined) {
      const nextName = input.name['en'] ?? '';
      const currentName = (current.nameI18n as Record<string, string>)['en'] ?? '';
      if (nextName.toLowerCase() !== currentName.toLowerCase()) {
        await this.assertNameFree(nextName, id);
      }
    }

    const data: Prisma.OptionTypeUpdateInput = {};
    if (input.code !== undefined) data.code = input.code;
    if (input.name !== undefined) data.nameI18n = input.name;
    if (input.dataType !== undefined) data.dataType = input.dataType;
    if (input.hasSwatch !== undefined) data.hasSwatch = input.hasSwatch;
    if (input.status !== undefined) data.status = input.status;

    await this.prisma.$transaction(async (tx) => {
      await tx.optionType.update({ where: { id }, data });
      await writeCatalogOutbox(tx, 'option_type', 'option_type.updated', id, {
        id,
        fields: Object.keys(data),
      });
    });

    const view = await this.get(id);
    await this.record(actor, 'catalog.option_type_updated', id, meta, {
      before: toView(current),
      after: view,
    });
    return view;
  }

  async remove(id: string, actor: Actor, meta: RequestMeta): Promise<void> {
    const current = await this.rowOrThrow(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.optionType.update({ where: { id }, data: { deletedAt: new Date() } });
      await writeCatalogOutbox(tx, 'option_type', 'option_type.deleted', id, { id });
    });
    await this.record(actor, 'catalog.option_type_deleted', id, meta, {
      before: toView(current),
      reason: 'soft delete',
    });
  }

  /** Restore a soft-deleted option type. Blocked when the freed code/name
   * was picked up by a live row in the meantime (same reasoning as
   * `BrandService.restore()`/`CategoryService.restore()`). */
  async restore(id: string, actor: Actor, meta: RequestMeta): Promise<OptionType> {
    const current = await this.archivedRowOrThrow(id);
    await this.assertCodeFree(current.code, id);
    await this.assertNameFree((current.nameI18n as Record<string, string>)['en'] ?? '', id);

    await this.prisma.$transaction(async (tx) => {
      await tx.optionType.update({ where: { id }, data: { deletedAt: null } });
      await writeCatalogOutbox(tx, 'option_type', 'option_type.restored', id, { id });
    });

    const view = await this.get(id);
    await this.record(actor, 'catalog.option_type_restored', id, meta, {
      after: view,
      reason: 'restore',
    });
    return view;
  }

  async addValue(
    id: string,
    input: AddOptionValueRequest,
    actor: Actor,
    meta: RequestMeta,
  ): Promise<OptionType> {
    const type = await this.rowOrThrow(id);
    if (type.values.some((v) => v.code === input.code)) {
      throw new AppError('OPTION_VALUE_CODE_TAKEN', 409, {
        detail: `"${input.code}" is already a value of this option type`,
      });
    }
    assertLabelFree(type.values, input.label['en'] ?? '', null);

    await this.prisma.$transaction(async (tx) => {
      await tx.optionValue.create({
        data: {
          optionTypeId: id,
          code: input.code,
          labelI18n: input.label,
          swatchHex: input.swatchHex ?? null,
          swatchImageKey: input.swatchImageKey ?? null,
          position: input.position ?? type.values.length,
        },
      });
      await writeCatalogOutbox(tx, 'option_type', 'option_type.updated', id, {
        id,
        valueAdded: input.code,
      });
    });

    const view = await this.get(id);
    await this.record(actor, 'catalog.option_type_updated', id, meta, {
      after: { value: input.code },
    });
    return view;
  }

  async updateValue(
    id: string,
    valueId: string,
    input: UpdateOptionValueRequest,
    actor: Actor,
    meta: RequestMeta,
  ): Promise<OptionType> {
    const type = await this.rowOrThrow(id);
    const value = type.values.find((v) => v.id === valueId);
    if (!value)
      throw new AppError('NOT_FOUND', 404, { detail: 'value not found on this option type' });
    if (input.code && input.code !== value.code && type.values.some((v) => v.code === input.code)) {
      throw new AppError('OPTION_VALUE_CODE_TAKEN', 409, {
        detail: `"${input.code}" is already a value of this option type`,
      });
    }
    if (input.label !== undefined) {
      assertLabelFree(type.values, input.label['en'] ?? '', valueId);
    }

    const data: Prisma.OptionValueUpdateInput = {};
    if (input.code !== undefined) data.code = input.code;
    if (input.label !== undefined) data.labelI18n = input.label;
    if (input.swatchHex !== undefined) data.swatchHex = input.swatchHex;
    if (input.swatchImageKey !== undefined) data.swatchImageKey = input.swatchImageKey;
    if (input.position !== undefined) data.position = input.position;
    if (input.status !== undefined) data.status = input.status;

    await this.prisma.$transaction(async (tx) => {
      await tx.optionValue.update({ where: { id: valueId }, data });
      await writeCatalogOutbox(tx, 'option_type', 'option_type.updated', id, {
        id,
        valueUpdated: valueId,
        fields: Object.keys(data),
      });
    });

    const view = await this.get(id);
    // `value.code` is the code *before* this update (already in scope from
    // the `find` above); the new one — which may itself be what changed —
    // comes from the freshly-refetched `view` instead of re-deriving it
    // from `data`, so it reflects what actually landed in the DB.
    const updatedCode = view.values.find((v) => v.id === valueId)?.code ?? null;
    await this.record(actor, 'catalog.option_type_updated', id, meta, {
      before: { valueId, value: value.code },
      after: { valueId, value: updatedCode, fields: Object.keys(data) },
    });
    return view;
  }

  async removeValue(id: string, valueId: string, actor: Actor, meta: RequestMeta): Promise<void> {
    const type = await this.rowOrThrow(id);
    // captured before the delete — `before` on a removal is the last
    // known state, same reasoning `remove()` (the option type itself)
    // already uses via `toView(current)`.
    const removedCode = type.values.find((v) => v.id === valueId)?.code ?? null;

    // Values are hard-deleted (no `deletedAt` column on `option_value`), and
    // every table that can reference one FKs with `onDelete: Restrict`
    // (`product_option_value`, `variant_option_value`, `media_option_tag`,
    // and `product_option.required_value_id` — the "One Size" case). Without
    // this pre-check, deleting an in-use value would fail on the raw DB
    // constraint with no `AppError` translation, surfacing as a generic
    // 500 instead of a clear "in use" message. Same pattern
    // `ValueSetService.remove()` already uses (count first, block before
    // attempting the delete) rather than catching the FK violation after
    // the fact.
    const [productUses, variantUses, mediaUses, requiredUses] = await Promise.all([
      this.prisma.productOptionValue.count({ where: { optionValueId: valueId } }),
      this.prisma.variantOptionValue.count({ where: { optionValueId: valueId } }),
      this.prisma.mediaOptionTag.count({ where: { optionValueId: valueId } }),
      this.prisma.productOption.count({ where: { requiredValueId: valueId } }),
    ]);
    const uses = productUses + variantUses + mediaUses + requiredUses;
    if (uses > 0) {
      throw new AppError('OPTION_VALUE_IN_USE', 409, {
        detail: `${uses} product/variant/media reference(s) use this value — deprecate it instead`,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.optionValue.deleteMany({
        where: { id: valueId, optionTypeId: id },
      });
      if (count === 0) {
        throw new AppError('NOT_FOUND', 404, { detail: 'value not found on this option type' });
      }
      await writeCatalogOutbox(tx, 'option_type', 'option_type.updated', id, {
        id,
        valueRemoved: valueId,
      });
    });
    await this.record(actor, 'catalog.option_type_updated', id, meta, {
      before: { valueId, value: removedCode },
      reason: 'value removed',
    });
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async rowOrThrow(id: string): Promise<OptionTypeWithValues> {
    const row = await this.prisma.optionType.findFirst({
      where: { id, deletedAt: null },
      include: { values: true },
    });
    if (!row) throw new AppError('NOT_FOUND', 404, { detail: 'option type not found' });
    return row;
  }

  private async archivedRowOrThrow(id: string): Promise<OptionTypeWithValues> {
    const row = await this.prisma.optionType.findFirst({
      where: { id, deletedAt: { not: null } },
      include: { values: true },
    });
    if (!row) throw new AppError('NOT_FOUND', 404, { detail: 'archived option type not found' });
    return row;
  }

  private async assertCodeFree(code: string, exceptId: string | null): Promise<void> {
    const clash = await this.prisma.optionType.findFirst({
      where: { code, deletedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    if (clash) {
      throw new AppError('OPTION_TYPE_CODE_TAKEN', 409, { detail: `code "${code}" is in use` });
    }
  }

  /** Case-insensitive `name.en` uniqueness across live option types. */
  private async assertNameFree(nameEn: string, exceptId: string | null): Promise<void> {
    const params: unknown[] = [nameEn];
    let sql = `SELECT id FROM catalog.option_type
                WHERE deleted_at IS NULL AND lower(name_i18n->>'en') = lower($1)`;
    if (exceptId) {
      params.push(exceptId);
      sql += ` AND id <> $2::uuid`;
    }
    const rows = await this.prisma.$queryRawUnsafe<{ id: string }[]>(`${sql} LIMIT 1`, ...params);
    if (rows.length > 0) {
      throw new AppError('OPTION_TYPE_NAME_TAKEN', 409, {
        detail: `an option type is already named "${nameEn}" (names are case-insensitive)`,
      });
    }
  }
}

function toView(row: OptionTypeWithValues): OptionType {
  return {
    id: row.id,
    code: row.code,
    name: row.nameI18n as Record<string, string>,
    dataType: row.dataType,
    hasSwatch: row.hasSwatch,
    status: row.status,
    values: [...row.values]
      .sort((a, b) => a.position - b.position || a.code.localeCompare(b.code))
      .map((v) => ({
        id: v.id,
        optionTypeId: v.optionTypeId,
        code: v.code,
        label: v.labelI18n as Record<string, string>,
        swatchHex: v.swatchHex,
        swatchImageKey: v.swatchImageKey,
        position: v.position,
        status: v.status,
        createdAt: v.createdAt.toISOString(),
        updatedAt: v.updatedAt.toISOString(),
      })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function dedupeByCode<T extends { code: string }>(xs: T[]): T[] {
  const seen = new Set<string>();
  return xs.filter((x) => {
    if (seen.has(x.code)) return false;
    seen.add(x.code);
    return true;
  });
}

const labelEn = (v: { labelI18n: unknown }): string =>
  ((v.labelI18n as Record<string, string> | null)?.['en'] ?? '').toLowerCase();

/** Reject a value label that (case-insensitively) matches another value of the type. */
function assertLabelFree(
  existing: OptionValueRow[],
  candidate: string,
  exceptId: string | null,
): void {
  const wanted = candidate.toLowerCase();
  if (existing.some((v) => v.id !== exceptId && labelEn(v) === wanted)) {
    throw new AppError('OPTION_VALUE_LABEL_TAKEN', 409, {
      detail: `"${candidate}" is already a value label of this option type (case-insensitive)`,
    });
  }
}

/** Reject nested create input that carries two values with the same label. */
function assertLabelsDistinct(values: { label: Record<string, string> }[]): void {
  const seen = new Set<string>();
  for (const v of values) {
    const key = (v.label['en'] ?? '').toLowerCase();
    if (seen.has(key)) {
      throw new AppError('OPTION_VALUE_LABEL_TAKEN', 409, {
        detail: `two values share the label "${v.label['en'] ?? ''}" (case-insensitive)`,
      });
    }
    seen.add(key);
  }
}
