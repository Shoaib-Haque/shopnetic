import { Injectable } from '@nestjs/common';
import type { Actor } from '@shopnetic/auth';
import type {
  CreateVariantRequest,
  UpdateVariantRequest,
  Variant,
  VariantSelection,
} from '@shopnetic/contracts';
import { Prisma } from '@shopnetic/db';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppError } from '../common/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import type { RequestMeta } from '../identity/identity.service.js';
import { writeCatalogOutbox } from './catalog-outbox.js';

const withValues = { optionValues: true } satisfies Prisma.VariantInclude;
type VariantRow = Prisma.VariantGetPayload<{ include: typeof withValues }>;

/**
 * A variant (SKU) — one concrete combination of one value per variant-axis
 * option of its product (plan/26 §2.3). Selections are immutable; `combo_signature`
 * is unique per product.
 */
@Injectable()
export class VariantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(productId: string): Promise<Variant[]> {
    await this.productOrThrow(productId);
    const rows = await this.prisma.variant.findMany({
      where: { productId, deletedAt: null },
      include: withValues,
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toView);
  }

  async get(id: string): Promise<Variant> {
    const row = await this.prisma.variant.findFirst({
      where: { id, deletedAt: null },
      include: withValues,
    });
    if (!row) throw new AppError('NOT_FOUND', 404, { detail: 'variant not found' });
    return toView(row);
  }

  async create(
    productId: string,
    input: CreateVariantRequest,
    actor: Actor,
    meta: RequestMeta,
  ): Promise<Variant> {
    const product = await this.productOrThrow(productId);
    const selections = await this.validateSelections(
      product.id,
      product.categoryId,
      input.selections,
    );
    const signature = signatureOf(selections);

    const dupe = await this.prisma.variant.findFirst({
      where: { productId, comboSignature: signature },
      select: { id: true },
    });
    if (dupe) {
      throw new AppError('VARIANT_COMBO_EXISTS', 409, {
        detail: 'a variant with this combination already exists',
      });
    }
    if (input.skuCode) await this.assertSkuFree(productId, input.skuCode, null);

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.variant.create({
        data: {
          productId,
          comboSignature: signature,
          ...(input.skuCode ? { skuCode: input.skuCode } : {}),
          ...(input.gtin ? { gtin: input.gtin } : {}),
          ...(input.weightG != null ? { weightG: input.weightG } : {}),
          ...(input.dims ? { dims: input.dims as Prisma.InputJsonValue } : {}),
          ...(input.status ? { status: input.status } : {}),
          ...(input.position !== undefined ? { position: input.position } : {}),
          optionValues: {
            create: selections.map((sel) => ({
              optionTypeId: sel.optionTypeId,
              optionValueId: sel.optionValueId,
            })),
          },
        },
        include: withValues,
      });
      await writeCatalogOutbox(tx, 'variant', 'variant.created', row.id, {
        id: row.id,
        productId,
        comboSignature: signature,
      });
      return row;
    });

    await this.record(actor, 'catalog.variant_created', created.id, meta, {
      after: toView(created),
    });
    return toView(created);
  }

  async update(
    id: string,
    input: UpdateVariantRequest,
    actor: Actor,
    meta: RequestMeta,
  ): Promise<Variant> {
    const current = await this.get(id);
    if (
      input.skuCode !== undefined &&
      input.skuCode !== null &&
      input.skuCode !== current.skuCode
    ) {
      await this.assertSkuFree(current.productId, input.skuCode, id);
    }

    const data: Prisma.VariantUpdateInput = {};
    if (input.skuCode !== undefined) data.skuCode = input.skuCode;
    if (input.gtin !== undefined) data.gtin = input.gtin;
    if (input.weightG !== undefined) data.weightG = input.weightG;
    if (input.dims !== undefined) {
      data.dims = input.dims === null ? Prisma.DbNull : (input.dims as Prisma.InputJsonValue);
    }
    if (input.status !== undefined) data.status = input.status;
    if (input.position !== undefined) data.position = input.position;

    await this.prisma.$transaction(async (tx) => {
      await tx.variant.update({ where: { id }, data });
      await writeCatalogOutbox(tx, 'variant', 'variant.updated', id, {
        id,
        fields: Object.keys(data),
      });
    });

    const view = await this.get(id);
    await this.record(actor, 'catalog.variant_updated', id, meta, { before: current, after: view });
    return view;
  }

  async remove(id: string, actor: Actor, meta: RequestMeta): Promise<void> {
    const current = await this.get(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.variant.update({ where: { id }, data: { deletedAt: new Date() } });
      await writeCatalogOutbox(tx, 'variant', 'variant.deleted', id, { id });
    });
    await this.record(actor, 'catalog.variant_deleted', id, meta, {
      before: current,
      reason: 'soft delete',
    });
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async productOrThrow(id: string): Promise<{ id: string; categoryId: string }> {
    const row = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, categoryId: true },
    });
    if (!row) throw new AppError('NOT_FOUND', 404, { detail: 'product not found' });
    return row;
  }

  /** Exactly one value per variant-axis product option; each offered by the product. */
  private async validateSelections(
    productId: string,
    categoryId: string,
    selections: VariantSelection[],
  ): Promise<VariantSelection[]> {
    const options = await this.prisma.productOption.findMany({
      where: { productId },
      select: { optionTypeId: true },
    });
    const axisRows = await this.prisma.categoryOption.findMany({
      where: {
        categoryId,
        isVariantAxis: true,
        optionTypeId: { in: options.map((o) => o.optionTypeId) },
      },
      select: { optionTypeId: true },
    });
    const axisTypeIds = new Set(axisRows.map((r) => r.optionTypeId));

    const seen = new Set<string>();
    for (const sel of selections) {
      if (!axisTypeIds.has(sel.optionTypeId) || seen.has(sel.optionTypeId)) {
        throw new AppError('VARIANT_SELECTION_INVALID', 422, {
          detail: 'selections must be exactly one value per variant-axis option',
        });
      }
      seen.add(sel.optionTypeId);
    }
    if (seen.size !== axisTypeIds.size) {
      throw new AppError('VARIANT_SELECTION_INVALID', 422, {
        detail: 'a variant-axis option has no selected value',
      });
    }

    if (selections.length > 0) {
      const offered = await this.prisma.productOptionValue.findMany({
        where: {
          productId,
          OR: selections.map((s) => ({
            optionTypeId: s.optionTypeId,
            optionValueId: s.optionValueId,
          })),
        },
        select: { optionTypeId: true },
      });
      if (offered.length !== selections.length) {
        throw new AppError('VARIANT_SELECTION_INVALID', 422, {
          detail: 'a selected value is not offered by this product on that axis',
        });
      }
    }
    return selections;
  }

  private async assertSkuFree(
    productId: string,
    skuCode: string,
    exceptId: string | null,
  ): Promise<void> {
    const clash = await this.prisma.variant.findFirst({
      where: { productId, skuCode, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    if (clash) {
      throw new AppError('CONFLICT', 409, {
        detail: `sku "${skuCode}" is used by another variant`,
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
      targetType: 'variant',
      targetId,
      ...(extra.before !== undefined ? { before: extra.before } : {}),
      ...(extra.after !== undefined ? { after: extra.after } : {}),
      ...(extra.reason !== undefined ? { reason: extra.reason } : {}),
      ...(meta.ip !== undefined ? { ip: meta.ip } : {}),
      ...(meta.correlationId !== undefined ? { correlationId: meta.correlationId } : {}),
    });
  }
}

function signatureOf(selections: VariantSelection[]): string {
  return [...selections]
    .sort((a, b) => a.optionTypeId.localeCompare(b.optionTypeId))
    .map((s) => `${s.optionTypeId}:${s.optionValueId}`)
    .join('|');
}

function toView(row: VariantRow): Variant {
  return {
    id: row.id,
    productId: row.productId,
    skuCode: row.skuCode,
    gtin: row.gtin,
    weightG: row.weightG,
    dims: (row.dims as Record<string, unknown> | null) ?? null,
    comboSignature: row.comboSignature,
    status: row.status,
    position: row.position,
    selections: [...row.optionValues]
      .sort((a, b) => a.optionTypeId.localeCompare(b.optionTypeId))
      .map((v) => ({ optionTypeId: v.optionTypeId, optionValueId: v.optionValueId })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
