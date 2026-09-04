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
import type { RequestMeta } from '../identity/identity.service.js';
import { writeCatalogOutbox } from './catalog-outbox.js';

type OptionTypeWithValues = OptionTypeRow & { values: OptionValueRow[] };

/**
 * Global option-type catalog (plan/26 section 3). Option types + their allowed values,
 * reusable across categories. Per-category behaviour (`is_variant_axis`,
 * `value_source`, …) is configured later in `category_option`.
 */
@Injectable()
export class OptionTypeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(opts: {
    status?: OptionType['status'];
    q?: string;
    includeDeleted?: boolean;
  }): Promise<OptionType[]> {
    const where: Prisma.OptionTypeWhereInput = {};
    if (!opts.includeDeleted) where.deletedAt = null;
    if (opts.status) where.status = opts.status;
    if (opts.q) where.code = { contains: opts.q.toLowerCase() };

    const rows = await this.prisma.optionType.findMany({
      where,
      include: { values: true },
      orderBy: { code: 'asc' },
    });
    return rows.map(toView);
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
    const values = dedupeByCode(input.values ?? []);

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
    if (input.code && input.code !== current.code) await this.assertCodeFree(input.code, id);

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
    await this.record(actor, 'catalog.option_type_updated', id, meta, {
      before: { value: value.code },
      after: { valueId, fields: Object.keys(data) },
    });
    return view;
  }

  async removeValue(id: string, valueId: string, actor: Actor, meta: RequestMeta): Promise<void> {
    await this.rowOrThrow(id);
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
      before: { valueId },
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

  private async assertCodeFree(code: string, exceptId: string | null): Promise<void> {
    const clash = await this.prisma.optionType.findFirst({
      where: { code, deletedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    if (clash) {
      throw new AppError('OPTION_TYPE_CODE_TAKEN', 409, { detail: `code "${code}" is in use` });
    }
  }

  private async record(
    actor: Actor,
    action: string,
    targetId: string,
    meta: RequestMeta,
    extra: { before?: unknown; after?: unknown; reason?: string },
  ): Promise<void> {
    await this.audit.record({
      actorAccountId: actor.accountId,
      action,
      targetType: 'option_type',
      targetId,
      ...(extra.before !== undefined ? { before: extra.before } : {}),
      ...(extra.after !== undefined ? { after: extra.after } : {}),
      ...(extra.reason !== undefined ? { reason: extra.reason } : {}),
      ...(meta.ip !== undefined ? { ip: meta.ip } : {}),
      ...(meta.correlationId !== undefined ? { correlationId: meta.correlationId } : {}),
    });
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
