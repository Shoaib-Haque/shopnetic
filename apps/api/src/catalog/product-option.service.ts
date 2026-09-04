import { Injectable } from '@nestjs/common';
import type { Actor } from '@shopnetic/auth';
import type {
  ProductOption,
  PutProductOptionRequest,
  SetProductOptionValuesRequest,
} from '@shopnetic/contracts';
import type { Prisma } from '@shopnetic/db';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppError } from '../common/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import type { RequestMeta } from '../identity/identity.service.js';
import { writeCatalogOutbox } from './catalog-outbox.js';

const withDetail = {
  optionType: { select: { code: true } },
  values: { include: { optionValue: { select: { code: true } } } },
} satisfies Prisma.ProductOptionInclude;
type ProductOptionRow = Prisma.ProductOptionGetPayload<{ include: typeof withDetail }>;

/**
 * Which option types a product uses and which of their values it offers
 * (plan/26 §2.2). An option type can only be added if the product's category has
 * a `category_option` row for it that is not `not_applicable`.
 */
@Injectable()
export class ProductOptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(productId: string): Promise<ProductOption[]> {
    await this.productOrThrow(productId);
    const rows = await this.prisma.productOption.findMany({
      where: { productId },
      include: withDetail,
      orderBy: [{ position: 'asc' }, { optionTypeId: 'asc' }],
    });
    return rows.map(toView);
  }

  async put(
    productId: string,
    optionTypeId: string,
    input: PutProductOptionRequest,
    actor: Actor,
    meta: RequestMeta,
  ): Promise<ProductOption> {
    const product = await this.productOrThrow(productId);
    await this.assertConfigured(product.categoryId, optionTypeId);
    if (input.requiredValueId != null) {
      await this.assertValueOfType(optionTypeId, input.requiredValueId);
    }

    const patch: { position?: number; requiredValueId?: string | null } = {};
    if (input.position !== undefined) patch.position = input.position;
    if (input.requiredValueId !== undefined) patch.requiredValueId = input.requiredValueId;

    await this.prisma.$transaction(async (tx) => {
      await tx.productOption.upsert({
        where: { productId_optionTypeId: { productId, optionTypeId } },
        create: { productId, optionTypeId, ...patch },
        update: patch,
      });
      await writeCatalogOutbox(tx, 'product', 'product.options_changed', productId, {
        productId,
        optionTypeId,
        op: 'set',
      });
    });

    const view = await this.rowView(productId, optionTypeId);
    await this.record(actor, productId, optionTypeId, meta, { after: view });
    return view;
  }

  async setValues(
    productId: string,
    optionTypeId: string,
    input: SetProductOptionValuesRequest,
    actor: Actor,
    meta: RequestMeta,
  ): Promise<ProductOption> {
    const product = await this.productOrThrow(productId);
    const option = await this.prisma.productOption.findUnique({
      where: { productId_optionTypeId: { productId, optionTypeId } },
    });
    if (!option) {
      throw new AppError('PRODUCT_OPTION_NOT_CONFIGURED', 422, {
        detail: 'add the option to the product before setting its values',
      });
    }

    const wanted = dedupe(input.values.map((v) => v.optionValueId));
    await this.assertValuesAllowed(product.categoryId, optionTypeId, wanted);

    const positionOf = new Map(input.values.map((v, i) => [v.optionValueId, v.position ?? i]));

    await this.prisma.$transaction(async (tx) => {
      await tx.productOptionValue.deleteMany({ where: { productId, optionTypeId } });
      if (wanted.length > 0) {
        await tx.productOptionValue.createMany({
          data: wanted.map((optionValueId) => ({
            productId,
            optionTypeId,
            optionValueId,
            position: positionOf.get(optionValueId) ?? 0,
          })),
        });
      }
      await writeCatalogOutbox(tx, 'product', 'product.options_changed', productId, {
        productId,
        optionTypeId,
        op: 'set_values',
        count: wanted.length,
      });
    });

    const view = await this.rowView(productId, optionTypeId);
    await this.record(actor, productId, optionTypeId, meta, {
      after: { optionTypeId, values: wanted },
    });
    return view;
  }

  async remove(
    productId: string,
    optionTypeId: string,
    actor: Actor,
    meta: RequestMeta,
  ): Promise<void> {
    await this.productOrThrow(productId);
    const usedByVariant = await this.prisma.variantOptionValue.count({
      where: { optionTypeId, variant: { productId } },
    });
    if (usedByVariant > 0) {
      throw new AppError('CONFLICT', 409, {
        detail: 'variants use this option; delete those variants first',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.productOption.deleteMany({ where: { productId, optionTypeId } });
      if (count === 0) {
        throw new AppError('NOT_FOUND', 404, { detail: 'option not on this product' });
      }
      await writeCatalogOutbox(tx, 'product', 'product.options_changed', productId, {
        productId,
        optionTypeId,
        op: 'remove',
      });
    });
    await this.record(actor, productId, optionTypeId, meta, {
      before: { optionTypeId },
      reason: 'removed',
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

  private async assertConfigured(categoryId: string, optionTypeId: string): Promise<void> {
    const co = await this.prisma.categoryOption.findUnique({
      where: { categoryId_optionTypeId: { categoryId, optionTypeId } },
      select: { applicability: true },
    });
    if (!co || co.applicability === 'not_applicable') {
      throw new AppError('PRODUCT_OPTION_NOT_CONFIGURED', 422, {
        detail: 'this option is not applicable to the product category',
      });
    }
  }

  private async assertValueOfType(optionTypeId: string, optionValueId: string): Promise<void> {
    const v = await this.prisma.optionValue.findFirst({
      where: { id: optionValueId, optionTypeId },
      select: { id: true },
    });
    if (!v) {
      throw new AppError('PRODUCT_OPTION_VALUE_INVALID', 422, {
        detail: 'value does not belong to this option type',
      });
    }
  }

  private async assertValuesAllowed(
    categoryId: string,
    optionTypeId: string,
    valueIds: string[],
  ): Promise<void> {
    if (valueIds.length === 0) return;
    const values = await this.prisma.optionValue.findMany({
      where: { id: { in: valueIds }, optionTypeId },
      select: { id: true, status: true },
    });
    if (values.length !== valueIds.length || values.some((v) => v.status !== 'active')) {
      throw new AppError('PRODUCT_OPTION_VALUE_INVALID', 422, {
        detail: 'a value is unknown, inactive, or of the wrong option type',
      });
    }

    const co = await this.prisma.categoryOption.findUnique({
      where: { categoryId_optionTypeId: { categoryId, optionTypeId } },
      select: { valueSource: true, valueSetId: true },
    });
    if (co?.valueSource === 'predefined' && co.valueSetId) {
      const inSet = await this.prisma.valueSetItem.findMany({
        where: { valueSetId: co.valueSetId, optionValueId: { in: valueIds } },
        select: { optionValueId: true },
      });
      if (inSet.length !== valueIds.length) {
        throw new AppError('PRODUCT_OPTION_VALUE_INVALID', 422, {
          detail: 'a value is not in the category’s predefined value set',
        });
      }
    }
  }

  private async rowView(productId: string, optionTypeId: string): Promise<ProductOption> {
    const row = await this.prisma.productOption.findUnique({
      where: { productId_optionTypeId: { productId, optionTypeId } },
      include: withDetail,
    });
    if (!row) throw new AppError('NOT_FOUND', 404, { detail: 'product option not found' });
    return toView(row);
  }

  private async record(
    actor: Actor,
    productId: string,
    optionTypeId: string,
    meta: RequestMeta,
    extra: { before?: unknown; after?: unknown; reason?: string },
  ): Promise<void> {
    await this.audit.record({
      actorAccountId: actor.accountId,
      action: 'catalog.product_options_changed',
      targetType: 'product_option',
      targetId: `${productId}:${optionTypeId}`,
      ...(extra.before !== undefined ? { before: extra.before } : {}),
      ...(extra.after !== undefined ? { after: extra.after } : {}),
      ...(extra.reason !== undefined ? { reason: extra.reason } : {}),
      ...(meta.ip !== undefined ? { ip: meta.ip } : {}),
      ...(meta.correlationId !== undefined ? { correlationId: meta.correlationId } : {}),
    });
  }
}

function toView(row: ProductOptionRow): ProductOption {
  return {
    productId: row.productId,
    optionTypeId: row.optionTypeId,
    optionTypeCode: row.optionType.code,
    position: row.position,
    requiredValueId: row.requiredValueId,
    values: [...row.values]
      .sort((a, b) => a.position - b.position)
      .map((v) => ({
        optionValueId: v.optionValueId,
        code: v.optionValue.code,
        position: v.position,
      })),
  };
}

function dedupe(xs: string[]): string[] {
  return [...new Set(xs)];
}
