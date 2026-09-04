import { Injectable } from '@nestjs/common';
import type { Actor } from '@shopnetic/auth';
import type {
  AddValueSetItemRequest,
  CreateValueSetRequest,
  UpdateValueSetRequest,
  ValueSet,
} from '@shopnetic/contracts';
import type { Prisma } from '@shopnetic/db';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppError } from '../common/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import type { RequestMeta } from '../identity/identity.service.js';
import { writeCatalogOutbox } from './catalog-outbox.js';

const withItems = {
  items: { include: { optionValue: true }, orderBy: { position: 'asc' } },
} satisfies Prisma.ValueSetInclude;

type ValueSetRow = Prisma.ValueSetGetPayload<{ include: typeof withItems }>;

/**
 * Managed value lists (plan/26 §2.1) — e.g. "Apparel sizes". A set is a bag of
 * option values; it is not bound to an option type here. `CategoryOptionService`
 * checks type consistency when a set is attached to a (category, option type).
 */
@Injectable()
export class ValueSetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<ValueSet[]> {
    const rows = await this.prisma.valueSet.findMany({
      include: withItems,
      orderBy: { name: 'asc' },
    });
    return rows.map(toView);
  }

  async get(id: string): Promise<ValueSet> {
    return toView(await this.rowOrThrow(id));
  }

  async create(input: CreateValueSetRequest, actor: Actor, meta: RequestMeta): Promise<ValueSet> {
    await this.assertNameFree(input.name, null);
    const items = dedupeById(input.items ?? []);
    if (items.length > 0) await this.assertOptionValuesExist(items.map((i) => i.optionValueId));

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.valueSet.create({
        data: {
          name: input.name,
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
    if (input.name !== current.name) await this.assertNameFree(input.name, id);

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
    const uses = await this.prisma.categoryOption.count({ where: { valueSetId: id } });
    if (uses > 0) {
      throw new AppError('VALUE_SET_IN_USE', 409, {
        detail: `${uses} category option(s) reference this value set`,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.valueSet.delete({ where: { id } });
      await writeCatalogOutbox(tx, 'value_set', 'value_set.deleted', id, { id });
    });
    await this.record(actor, 'catalog.value_set_deleted', id, meta, {
      before: toView(current),
      reason: 'deleted',
    });
  }

  async addItem(
    id: string,
    input: AddValueSetItemRequest,
    actor: Actor,
    meta: RequestMeta,
  ): Promise<ValueSet> {
    const current = await this.rowOrThrow(id);
    await this.assertOptionValuesExist([input.optionValueId]);
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
      await writeCatalogOutbox(tx, 'value_set', 'value_set.updated', id, {
        id,
        itemAdded: input.optionValueId,
      });
    });

    const view = await this.get(id);
    await this.record(actor, 'catalog.value_set_updated', id, meta, {
      after: { itemAdded: input.optionValueId },
    });
    return view;
  }

  async removeItem(
    id: string,
    optionValueId: string,
    actor: Actor,
    meta: RequestMeta,
  ): Promise<void> {
    await this.rowOrThrow(id);
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.valueSetItem.deleteMany({
        where: { valueSetId: id, optionValueId },
      });
      if (count === 0) throw new AppError('NOT_FOUND', 404, { detail: 'value not in this set' });
      await writeCatalogOutbox(tx, 'value_set', 'value_set.updated', id, {
        id,
        itemRemoved: optionValueId,
      });
    });
    await this.record(actor, 'catalog.value_set_updated', id, meta, {
      before: { itemRemoved: optionValueId },
    });
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async rowOrThrow(id: string): Promise<ValueSetRow> {
    const row = await this.prisma.valueSet.findUnique({ where: { id }, include: withItems });
    if (!row) throw new AppError('NOT_FOUND', 404, { detail: 'value set not found' });
    return row;
  }

  private async assertNameFree(name: string, exceptId: string | null): Promise<void> {
    const clash = await this.prisma.valueSet.findFirst({
      where: { name, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    if (clash) {
      throw new AppError('VALUE_SET_NAME_TAKEN', 409, { detail: `name "${name}" is in use` });
    }
  }

  private async assertOptionValuesExist(ids: string[]): Promise<void> {
    const found = await this.prisma.optionValue.count({ where: { id: { in: ids } } });
    if (found !== new Set(ids).size) {
      throw new AppError('VALIDATION_ERROR', 422, { detail: 'unknown option value in items' });
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
    items: [...row.items]
      .sort((a, b) => a.position - b.position)
      .map((i) => ({
        optionValueId: i.optionValueId,
        optionTypeId: i.optionValue.optionTypeId,
        code: i.optionValue.code,
        label: i.optionValue.labelI18n as Record<string, string>,
        position: i.position,
      })),
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
