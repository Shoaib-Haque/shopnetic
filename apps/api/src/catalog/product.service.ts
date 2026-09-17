import { Injectable } from '@nestjs/common';
import type { Actor } from '@shopnetic/auth';
import type { CreateProductRequest, Product, UpdateProductRequest } from '@shopnetic/contracts';
import { Prisma } from '@shopnetic/db';
import type { Product as ProductRow } from '@shopnetic/db';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppError } from '../common/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import { auditRecordFor } from '../audit/audit-record-for.js';
import { clampLimit, paginate } from '../common/pagination.js';
import type { RequestMeta } from '../identity/identity.service.js';
import { writeCatalogOutbox } from './catalog-outbox.js';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

/**
 * The shared catalog product (plan/26 section 1–2). Admin-authored base products;
 * seller-proposed ones arrive through a moderation queue later. Price/stock are
 * per-seller `offer` rows (inventory context) — not here.
 */
@Injectable()
export class ProductService {
  private readonly record: ReturnType<typeof auditRecordFor>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {
    this.record = auditRecordFor(this.audit, 'product');
  }

  async list(opts: {
    categoryId?: string;
    brandId?: string;
    status?: Product['status'];
    q?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ items: Product[]; nextCursor?: string }> {
    const limit = clampLimit(opts.limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT);
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
    const { page, nextCursor } = paginate(rows, limit);
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

    // `categoryName`/`brandName` are audit-only — added alongside `view`,
    // not folded into `toView()` itself, since that builds the public
    // `Product` API shape (`@shopnetic/contracts`) a name field has no
    // business joining onto. `proposedBySellerId` stays a bare id — no
    // seller-facing name exists yet (that plane isn't built out), so
    // there's nothing meaningful to snapshot for it.
    const view = toView(created);
    const [categoryName, brandName] = await Promise.all([
      this.categoryNameOf(view.categoryId),
      this.brandNameOf(view.brandId),
    ]);
    await this.record(actor, 'catalog.product_created', created.id, meta, {
      after: { ...view, categoryName, brandName },
    });
    return view;
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
    const beforeView = toView(current);
    const [beforeCategoryName, beforeBrandName, afterCategoryName, afterBrandName] =
      await Promise.all([
        this.categoryNameOf(beforeView.categoryId),
        this.brandNameOf(beforeView.brandId),
        this.categoryNameOf(view.categoryId),
        this.brandNameOf(view.brandId),
      ]);
    await this.record(actor, 'catalog.product_updated', id, meta, {
      before: { ...beforeView, categoryName: beforeCategoryName, brandName: beforeBrandName },
      after: { ...view, categoryName: afterCategoryName, brandName: afterBrandName },
    });
    return view;
  }

  async remove(id: string, actor: Actor, meta: RequestMeta): Promise<void> {
    const current = await this.rowOrThrow(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id }, data: { deletedAt: new Date() } });
      await writeCatalogOutbox(tx, 'product', 'product.deleted', id, { id });
    });
    const view = toView(current);
    const [categoryName, brandName] = await Promise.all([
      this.categoryNameOf(view.categoryId),
      this.brandNameOf(view.brandId),
    ]);
    await this.record(actor, 'catalog.product_deleted', id, meta, {
      before: { ...view, categoryName, brandName },
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

  /** Best-effort name lookups for audit-log snapshots — see the comment on
   * `create()`'s own use of these. No `deleted_at` filter on either: the
   * referenced row could itself be archived by the time someone reads the
   * log, and the name at write time is still correct to show. */
  private async categoryNameOf(id: string): Promise<string | null> {
    const row = await this.prisma.category.findUnique({
      where: { id },
      select: { nameI18n: true },
    });
    return (row?.nameI18n as Record<string, string> | undefined)?.['en'] ?? null;
  }

  private async brandNameOf(id: string | null): Promise<string | null> {
    if (!id) return null;
    const row = await this.prisma.brand.findUnique({ where: { id }, select: { name: true } });
    return row?.name ?? null;
  }

  private async assertSlugFree(slug: string, exceptId: string | null): Promise<void> {
    const clash = await this.prisma.product.findFirst({
      where: { slug, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    if (clash)
      throw new AppError('PRODUCT_SLUG_TAKEN', 409, { detail: `slug "${slug}" is in use` });
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
