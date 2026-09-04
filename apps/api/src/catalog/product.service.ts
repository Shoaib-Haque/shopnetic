import { Injectable } from '@nestjs/common';
import type { Actor } from '@shopnetic/auth';
import type { CreateProductRequest, Product, UpdateProductRequest } from '@shopnetic/contracts';
import { Prisma } from '@shopnetic/db';
import type { Product as ProductRow } from '@shopnetic/db';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppError } from '../common/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import type { RequestMeta } from '../identity/identity.service.js';
import { writeCatalogOutbox } from './catalog-outbox.js';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

/**
 * The shared catalog product (plan/26 §1–2). Admin-authored base products;
 * seller-proposed ones arrive through a moderation queue later. Price/stock are
 * per-seller `offer` rows (inventory context) — not here.
 */
@Injectable()
export class ProductService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(opts: {
    categoryId?: string;
    brandId?: string;
    status?: Product['status'];
    q?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ items: Product[]; nextCursor?: string }> {
    const limit = clamp(opts.limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT);
    const where: Prisma.ProductWhereInput = { deletedAt: null };
    if (opts.categoryId) where.categoryId = opts.categoryId;
    if (opts.brandId) where.brandId = opts.brandId;
    if (opts.status) where.status = opts.status;
    if (opts.q) where.slug = { contains: opts.q.toLowerCase() };

    const rows = await this.prisma.product.findMany({
      where,
      orderBy: { id: 'desc' },
      take: limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, limit);
    const nextCursor = rows.length > limit ? page.at(-1)?.id : undefined;
    return { items: page.map(toView), ...(nextCursor ? { nextCursor } : {}) };
  }

  async get(id: string): Promise<Product> {
    return toView(await this.rowOrThrow(id));
  }

  async create(input: CreateProductRequest, actor: Actor, meta: RequestMeta): Promise<Product> {
    const category = await this.categoryOrThrow(input.categoryId);
    const brandId = input.brandId ?? null;
    await this.assertBrandRule(category.brandRequirement, brandId);
    assertPriceCoherent(input.basePriceMinor ?? null, input.currency ?? null);
    await this.assertSlugFree(input.slug, null);

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.product.create({
        data: {
          categoryId: input.categoryId,
          brandId,
          titleI18n: input.title,
          ...(input.description ? { descriptionI18n: input.description } : {}),
          slug: input.slug,
          ...(input.status ? { status: input.status } : {}),
          ...(input.basePriceMinor != null ? { basePriceMinor: BigInt(input.basePriceMinor) } : {}),
          ...(input.currency ? { currency: input.currency } : {}),
          ...(input.spec ? { spec: input.spec as Prisma.InputJsonValue } : {}),
          ...(input.proposedBySellerId ? { proposedBySellerId: input.proposedBySellerId } : {}),
        },
      });
      await writeCatalogOutbox(tx, 'product', 'product.created', row.id, {
        id: row.id,
        slug: row.slug,
        categoryId: row.categoryId,
        status: row.status,
      });
      return row;
    });

    await this.record(actor, 'catalog.product_created', created.id, meta, {
      after: toView(created),
    });
    return toView(created);
  }

  async update(
    id: string,
    input: UpdateProductRequest,
    actor: Actor,
    meta: RequestMeta,
  ): Promise<Product> {
    const current = await this.rowOrThrow(id);
    if (input.slug !== undefined && input.slug !== current.slug) {
      await this.assertSlugFree(input.slug, id);
    }

    const nextBrandId = input.brandId !== undefined ? input.brandId : current.brandId;
    if (input.brandId !== undefined) {
      const category = await this.categoryOrThrow(current.categoryId);
      await this.assertBrandRule(category.brandRequirement, nextBrandId);
    }
    const nextPrice =
      input.basePriceMinor !== undefined
        ? input.basePriceMinor
        : current.basePriceMinor === null
          ? null
          : Number(current.basePriceMinor);
    const nextCurrency = input.currency !== undefined ? input.currency : current.currency;
    assertPriceCoherent(nextPrice, nextCurrency);

    const data: Prisma.ProductUpdateInput = {};
    if (input.title !== undefined) data.titleI18n = input.title;
    if (input.description !== undefined) {
      data.descriptionI18n = input.description === null ? Prisma.DbNull : input.description;
    }
    if (input.slug !== undefined) data.slug = input.slug;
    if (input.status !== undefined) data.status = input.status;
    if (input.brandId !== undefined) {
      data.brand = input.brandId ? { connect: { id: input.brandId } } : { disconnect: true };
    }
    if (input.basePriceMinor !== undefined) {
      data.basePriceMinor = input.basePriceMinor === null ? null : BigInt(input.basePriceMinor);
    }
    if (input.currency !== undefined) data.currency = input.currency;
    if (input.spec !== undefined) data.spec = input.spec as Prisma.InputJsonValue;

    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id }, data });
      await writeCatalogOutbox(tx, 'product', 'product.updated', id, {
        id,
        fields: Object.keys(data),
      });
    });

    const view = await this.get(id);
    await this.record(actor, 'catalog.product_updated', id, meta, {
      before: toView(current),
      after: view,
    });
    return view;
  }

  async remove(id: string, actor: Actor, meta: RequestMeta): Promise<void> {
    const current = await this.rowOrThrow(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id }, data: { deletedAt: new Date() } });
      await writeCatalogOutbox(tx, 'product', 'product.deleted', id, { id });
    });
    await this.record(actor, 'catalog.product_deleted', id, meta, {
      before: toView(current),
      reason: 'soft delete',
    });
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async rowOrThrow(id: string): Promise<ProductRow> {
    const row = await this.prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!row) throw new AppError('NOT_FOUND', 404, { detail: 'product not found' });
    return row;
  }

  private async categoryOrThrow(
    id: string,
  ): Promise<{ id: string; brandRequirement: 'required' | 'optional' | 'none' }> {
    const row = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, brandRequirement: true },
    });
    if (!row) {
      throw new AppError('PRODUCT_CATEGORY_INVALID', 422, { detail: 'category not found' });
    }
    return row;
  }

  private async assertBrandRule(
    requirement: 'required' | 'optional' | 'none',
    brandId: string | null,
  ): Promise<void> {
    if (requirement === 'required' && brandId === null) {
      throw new AppError('PRODUCT_BRAND_INVALID', 422, {
        detail: 'this category requires a brand',
      });
    }
    if (requirement === 'none' && brandId !== null) {
      throw new AppError('PRODUCT_BRAND_INVALID', 422, {
        detail: 'this category does not allow a brand',
      });
    }
    if (brandId !== null) {
      const brand = await this.prisma.brand.findFirst({
        where: { id: brandId, deletedAt: null },
        select: { id: true },
      });
      if (!brand) {
        throw new AppError('PRODUCT_BRAND_INVALID', 422, { detail: 'brand not found' });
      }
    }
  }

  private async assertSlugFree(slug: string, exceptId: string | null): Promise<void> {
    const clash = await this.prisma.product.findFirst({
      where: { slug, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    if (clash)
      throw new AppError('PRODUCT_SLUG_TAKEN', 409, { detail: `slug "${slug}" is in use` });
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
      targetType: 'product',
      targetId,
      ...(extra.before !== undefined ? { before: extra.before } : {}),
      ...(extra.after !== undefined ? { after: extra.after } : {}),
      ...(extra.reason !== undefined ? { reason: extra.reason } : {}),
      ...(meta.ip !== undefined ? { ip: meta.ip } : {}),
      ...(meta.correlationId !== undefined ? { correlationId: meta.correlationId } : {}),
    });
  }
}

function assertPriceCoherent(priceMinor: number | null, currency: string | null): void {
  if (priceMinor !== null && !currency) {
    throw new AppError('VALIDATION_ERROR', 422, {
      detail: 'currency is required when basePriceMinor is set',
      fields: [{ field: 'currency', rule: 'required', message: 'errors.field_required' }],
    });
  }
}

function toView(row: ProductRow): Product {
  return {
    id: row.id,
    categoryId: row.categoryId,
    brandId: row.brandId,
    title: row.titleI18n as Record<string, string>,
    description: (row.descriptionI18n as Record<string, string> | null) ?? null,
    slug: row.slug,
    status: row.status,
    basePriceMinor: row.basePriceMinor === null ? null : row.basePriceMinor.toString(),
    currency: row.currency,
    spec: (row.spec as Record<string, unknown>) ?? {},
    proposedBySellerId: row.proposedBySellerId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(Math.trunc(n), lo), hi);
}
