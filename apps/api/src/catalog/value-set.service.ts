import { Injectable } from '@nestjs/common';
import type { Actor } from '@shopnetic/auth';
import type {
  AddValueSetItemRequest,
  CreateValueSetRequest,
  ReorderValueSetItemsRequest,
  UpdateValueSetRequest,
  ValueSet,
  ValueSetListStatus,
} from '@shopnetic/contracts';
import type { Prisma } from '@shopnetic/db';
import { tokenizeForSql, buildTokenSearch } from '../common/text-search.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppError } from '../common/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import type { RequestMeta } from '../identity/identity.service.js';
import { writeCatalogOutbox } from './catalog-outbox.js';

const withItems = {
  items: { include: { optionValue: true }, orderBy: { position: 'asc' } },
} satisfies Prisma.ValueSetInclude;

type ValueSetRow = Prisma.ValueSetGetPayload<{ include: typeof withItems }>;

export interface ListValueSetOpts {
  status?: ValueSetListStatus;
  optionTypeId?: string;
  q?: string;
}

/**
 * Managed value lists (plan/26 section 2.1) — e.g. "Apparel sizes".
 * Bound to an option type; referenced by `category_option.value_set_id` for
 * `predefined` and `hybrid` value sources.
 */
@Injectable()
export class ValueSetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(opts?: ListValueSetOpts): Promise<ValueSet[]> {
    const status = opts?.status ?? 'active';
    const tokens = opts?.q ? tokenizeForSql(opts.q) : [];
    const isSearch = tokens.length > 0;

    const params: unknown[] = [];
    const where: string[] = [];

    if (status === 'active') {
      where.push('deleted_at IS NULL');
    } else if (status === 'archived') {
      where.push('deleted_at IS NOT NULL');
    }

    if (opts?.optionTypeId) {
      params.push(opts.optionTypeId);
      where.push(`option_type_id = $${params.length}::uuid`);
    }

    let scoreExpr = '0';
    if (isSearch) {
      const haystack = 'lower(name)';
      const { whereSql, scoreSql } = buildTokenSearch(tokens, haystack, params);
      where.push(whereSql);
      scoreExpr = scoreSql;
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const orderClause = isSearch ? `ORDER BY ${scoreExpr} DESC, name ASC` : 'ORDER BY name ASC';

    const idRows = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM catalog.value_set ${whereClause} ${orderClause}`,
      ...params,
    );

    if (idRows.length === 0) {
      return [];
    }

    const ids = idRows.map((r) => r.id);
    const rows = await this.prisma.valueSet.findMany({
      where: { id: { in: ids } },
      include: withItems,
    });

    const rowMap = new Map(rows.map((r) => [r.id, r]));
    return ids
      .map((id) => rowMap.get(id))
      .filter((r): r is ValueSetRow => r !== undefined)
      .map(toView);
  }

  async get(id: string): Promise<ValueSet> {
    return toView(await this.rowOrThrow(id));
  }

  async create(input: CreateValueSetRequest, actor: Actor, meta: RequestMeta): Promise<ValueSet> {
    const ot = await this.prisma.optionType.findUnique({
      where: { id: input.optionTypeId, deletedAt: null },
    });
    if (!ot) {
      throw new AppError('NOT_FOUND', 404, { detail: 'option type not found' });
    }

    await this.assertNameFree(input.name, null);
    const items = dedupeById(input.items ?? []);
    if (items.length > 0) {
      await this.assertOptionValuesBelongToType(
        items.map((i) => i.optionValueId),
        input.optionTypeId,
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.valueSet.create({
        data: {
          name: input.name,
          optionTypeId: input.optionTypeId,
          items: {
            create: items.map((i, idx) => ({
              optionValueId: i.optionValueId,
              position: i.position ?? idx,
            })),
          },
        },
        include: withItems,
      });
      await writeCatalogOutbox(tx, 'value_set', 'value_set.created', row.id, {
        id: row.id,
        name: row.name,
        optionTypeId: row.optionTypeId,
        itemCount: row.items.length,
      });
      return row;
    });

    await this.record(actor, 'catalog.value_set_created', created.id, meta, {
      after: toView(created),
    });
    return toView(created);
  }

  async update(
    id: string,
    input: UpdateValueSetRequest,
    actor: Actor,
    meta: RequestMeta,
  ): Promise<ValueSet> {
    const current = await this.rowOrThrow(id);
    if (current.deletedAt !== null) {
      throw new AppError('VALUE_SET_ARCHIVED', 409, { detail: 'cannot update archived value set' });
    }

    if (input.expectedUpdatedAt !== undefined) {
      if (input.expectedUpdatedAt !== current.updatedAt.toISOString()) {
        throw new AppError('CONFLICT', 409, { detail: 'value set changed since it was loaded' });
      }
    }

    if (input.name === current.name) {
      return toView(current);
    }

    await this.assertNameFree(input.name, id);

    await this.prisma.$transaction(async (tx) => {
      await tx.valueSet.update({ where: { id }, data: { name: input.name } });
      await writeCatalogOutbox(tx, 'value_set', 'value_set.updated', id, { id, name: input.name });
    });

    const view = await this.get(id);
    await this.record(actor, 'catalog.value_set_updated', id, meta, {
      before: toView(current),
      after: view,
    });
    return view;
  }

  async remove(id: string, actor: Actor, meta: RequestMeta): Promise<void> {
    const current = await this.rowOrThrow(id);
    if (current.deletedAt !== null) {
      return;
    }

    const uses = await this.prisma.categoryOption.count({ where: { valueSetId: id } });
    if (uses > 0) {
      throw new AppError('VALUE_SET_IN_USE', 409, {
        detail: `${uses} category option(s) reference this value set`,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.valueSet.update({ where: { id }, data: { deletedAt: new Date() } });
      await writeCatalogOutbox(tx, 'value_set', 'value_set.archived', id, { id });
    });
    await this.record(actor, 'catalog.value_set_archived', id, meta, {
      before: toView(current),
      reason: 'archived',
    });
  }

  async restore(id: string, actor: Actor, meta: RequestMeta): Promise<ValueSet> {
    const current = await this.rowOrThrow(id);
    if (current.deletedAt === null) {
      return toView(current);
    }

    const ot = await this.prisma.optionType.findUnique({
      where: { id: current.optionTypeId },
      select: { id: true, deletedAt: true },
    });
    if (!ot || ot.deletedAt !== null) {
      throw new AppError('OPTION_TYPE_ARCHIVED', 409, {
        detail: "that value set's option type is archived — restore the option type first",
      });
    }

    await this.assertNameFree(current.name, id);

    await this.prisma.$transaction(async (tx) => {
      await tx.valueSet.update({ where: { id }, data: { deletedAt: null } });
      await writeCatalogOutbox(tx, 'value_set', 'value_set.restored', id, { id });
    });

    const restored = await this.rowOrThrow(id);
    await this.record(actor, 'catalog.value_set_restored', id, meta, {
      before: toView(current),
      after: toView(restored),
    });
    return toView(restored);
  }

  async addItem(
    id: string,
    input: AddValueSetItemRequest,
    actor: Actor,
    meta: RequestMeta,
  ): Promise<ValueSet> {
    const current = await this.rowOrThrow(id);
    if (current.deletedAt !== null) {
      throw new AppError('VALUE_SET_ARCHIVED', 409, { detail: 'cannot modify archived value set' });
    }

    await this.assertOptionValuesBelongToType([input.optionValueId], current.optionTypeId);

    if (current.items.some((i) => i.optionValueId === input.optionValueId)) {
      throw new AppError('CONFLICT', 409, { detail: 'value already in this set' });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.valueSetItem.create({
        data: {
          valueSetId: id,
          optionValueId: input.optionValueId,
          position: input.position ?? current.items.length,
        },
      });
      await tx.valueSet.update({ where: { id }, data: { updatedAt: new Date() } });
      await writeCatalogOutbox(tx, 'value_set', 'value_set.updated', id, {
        id,
        itemAdded: input.optionValueId,
      });
    });

    const view = await this.get(id);
    await this.record(actor, 'catalog.value_set_updated', id, meta, {
      after: {
        itemAdded: input.optionValueId,
        itemAddedCode: await this.codeOf(input.optionValueId),
      },
    });
    return view;
  }

  async removeItem(
    id: string,
    optionValueId: string,
    actor: Actor,
    meta: RequestMeta,
  ): Promise<void> {
    const current = await this.rowOrThrow(id);
    if (current.deletedAt !== null) {
      throw new AppError('VALUE_SET_ARCHIVED', 409, { detail: 'cannot modify archived value set' });
    }

    const removedCode = await this.codeOf(optionValueId);
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.valueSetItem.deleteMany({
        where: { valueSetId: id, optionValueId },
      });
      if (count === 0) throw new AppError('NOT_FOUND', 404, { detail: 'value not in this set' });
      await tx.valueSet.update({ where: { id }, data: { updatedAt: new Date() } });
      await writeCatalogOutbox(tx, 'value_set', 'value_set.updated', id, {
        id,
        itemRemoved: optionValueId,
      });
    });
    await this.record(actor, 'catalog.value_set_updated', id, meta, {
      before: { itemRemoved: optionValueId, itemRemovedCode: removedCode },
    });
  }

  async reorderItems(
    id: string,
    input: ReorderValueSetItemsRequest,
    actor: Actor,
    meta: RequestMeta,
  ): Promise<ValueSet> {
    const current = await this.rowOrThrow(id);
    if (current.deletedAt !== null) {
      throw new AppError('VALUE_SET_ARCHIVED', 409, { detail: 'cannot modify archived value set' });
    }

    const currentIds = new Set(current.items.map((i) => i.optionValueId));
    const submittedIds = new Set(input.orderedOptionValueIds);
    if (
      submittedIds.size !== input.orderedOptionValueIds.length ||
      input.orderedOptionValueIds.length !== current.items.length ||
      !input.orderedOptionValueIds.every((valId) => currentIds.has(valId))
    ) {
      throw new AppError('VALIDATION_ERROR', 422, {
        detail:
          'orderedOptionValueIds must match all option value IDs in the set without duplicates',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await Promise.all(
        input.orderedOptionValueIds.map((optValId, idx) =>
          tx.valueSetItem.update({
            where: { valueSetId_optionValueId: { valueSetId: id, optionValueId: optValId } },
            data: { position: idx },
          }),
        ),
      );
      await tx.valueSet.update({ where: { id }, data: { updatedAt: new Date() } });
      await writeCatalogOutbox(tx, 'value_set', 'value_set.updated', id, {
        id,
        itemsReordered: input.orderedOptionValueIds,
      });
    });

    const view = await this.get(id);
    await this.record(actor, 'catalog.value_set_items_reordered', id, meta, {
      after: {
        orderedOptionValueIds: input.orderedOptionValueIds,
      },
    });
    return view;
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async rowOrThrow(id: string): Promise<ValueSetRow> {
    const row = await this.prisma.valueSet.findUnique({ where: { id }, include: withItems });
    if (!row) throw new AppError('NOT_FOUND', 404, { detail: 'value set not found' });
    return row;
  }

  /** Case-insensitive value-set name uniqueness among live records. */
  private async assertNameFree(name: string, exceptId: string | null): Promise<void> {
    const clash = await this.prisma.valueSet.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        deletedAt: null,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (clash) {
      throw new AppError('VALUE_SET_NAME_TAKEN', 409, {
        detail: `name "${name}" is in use (names are case-insensitive)`,
      });
    }
  }

  private async codeOf(optionValueId: string): Promise<string | null> {
    const row = await this.prisma.optionValue.findUnique({
      where: { id: optionValueId },
      select: { code: true },
    });
    return row?.code ?? null;
  }

  private async assertOptionValuesBelongToType(ids: string[], optionTypeId: string): Promise<void> {
    const found = await this.prisma.optionValue.findMany({
      where: { id: { in: ids } },
      select: { id: true, optionTypeId: true },
    });
    if (found.length !== new Set(ids).size) {
      throw new AppError('VALIDATION_ERROR', 422, { detail: 'unknown option value in items' });
    }
    if (found.some((v) => v.optionTypeId !== optionTypeId)) {
      throw new AppError('VALUE_SET_TYPE_MISMATCH', 422, {
        detail: 'the value set contains values of another option type',
      });
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
      targetType: 'value_set',
      targetId,
      ...(extra.before !== undefined ? { before: extra.before } : {}),
      ...(extra.after !== undefined ? { after: extra.after } : {}),
      ...(extra.reason !== undefined ? { reason: extra.reason } : {}),
      ...(meta.ip !== undefined ? { ip: meta.ip } : {}),
      ...(meta.correlationId !== undefined ? { correlationId: meta.correlationId } : {}),
    });
  }
}

function toView(row: ValueSetRow): ValueSet {
  return {
    id: row.id,
    name: row.name,
    optionTypeId: row.optionTypeId,
    items: [...row.items]
      .sort((a, b) => a.position - b.position)
      .map((i) => ({
        optionValueId: i.optionValueId,
        optionTypeId: i.optionValue.optionTypeId,
        code: i.optionValue.code,
        label: i.optionValue.labelI18n as Record<string, string>,
        position: i.position,
      })),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function dedupeById<T extends { optionValueId: string }>(xs: T[]): T[] {
  const seen = new Set<string>();
  return xs.filter((x) => {
    if (seen.has(x.optionValueId)) return false;
    seen.add(x.optionValueId);
    return true;
  });
}
