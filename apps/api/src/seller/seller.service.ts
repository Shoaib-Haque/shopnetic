import { Injectable } from '@nestjs/common';
import type { Actor } from '@shopnetic/auth';
import type {
  CreateSellerRequest,
  SellerStatus,
  SellerWithShop,
  Shop,
  UpdateSellerStatusRequest,
} from '@shopnetic/contracts';
import type { Seller as SellerRow, Shop as ShopRow } from '@shopnetic/db';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppError } from '../common/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import { auditRecordFor } from '../audit/audit-record-for.js';
import { clampLimit } from '../common/pagination.js';
import type { RequestMeta } from '../identity/identity.service.js';
import { writeSellerOutbox } from './seller-outbox.js';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function serializeShop(shop: ShopRow): Shop {
  return {
    id: shop.id,
    sellerId: shop.sellerId,
    slug: shop.slug,
    displayName: shop.displayName,
    description: shop.description,
    logoUrl: shop.logoUrl,
    bannerUrl: shop.bannerUrl,
    vacationUntil: shop.vacationUntil ? shop.vacationUntil.toISOString() : null,
    createdAt: shop.createdAt.toISOString(),
    updatedAt: shop.updatedAt.toISOString(),
    deletedAt: shop.deletedAt ? shop.deletedAt.toISOString() : null,
  };
}

function serializeSeller(seller: SellerRow & { shop: ShopRow | null }): SellerWithShop {
  return {
    id: seller.id,
    accountId: seller.accountId,
    legalName: seller.legalName,
    type: seller.type,
    country: seller.country,
    status: seller.status,
    commissionOverrideBps: seller.commissionOverrideBps,
    reserveBps: seller.reserveBps,
    createdAt: seller.createdAt.toISOString(),
    updatedAt: seller.updatedAt.toISOString(),
    deletedAt: seller.deletedAt ? seller.deletedAt.toISOString() : null,
    shop: seller.shop ? serializeShop(seller.shop) : null,
  };
}

@Injectable()
export class SellerService {
  private readonly record: ReturnType<typeof auditRecordFor>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {
    this.record = auditRecordFor(this.audit, 'seller');
  }

  async get(id: string): Promise<SellerWithShop> {
    const seller = await this.prisma.seller.findUnique({
      where: { id },
      include: { shop: true },
    });
    if (!seller || seller.deletedAt) {
      throw new AppError('SELLER_NOT_FOUND', 404, { detail: `seller ${id} not found` });
    }
    return serializeSeller(seller);
  }

  async getByAccountId(accountId: string): Promise<SellerWithShop | null> {
    const seller = await this.prisma.seller.findUnique({
      where: { accountId },
      include: { shop: true },
    });
    if (!seller || seller.deletedAt) return null;
    return serializeSeller(seller);
  }

  async getByShopSlug(slug: string): Promise<SellerWithShop | null> {
    const shop = await this.prisma.shop.findUnique({
      where: { slug },
      include: { seller: { include: { shop: true } } },
    });
    if (!shop || shop.deletedAt || shop.seller.deletedAt) return null;
    return serializeSeller(shop.seller);
  }

  async list(opts: {
    status?: SellerStatus;
    cursor?: string;
    limit?: number;
  }): Promise<{ items: SellerWithShop[]; nextCursor?: string }> {
    const limit = clampLimit(opts.limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT);
    const sellers = await this.prisma.seller.findMany({
      where: {
        deletedAt: null,
        ...(opts.status ? { status: opts.status } : {}),
      },
      include: { shop: true },
      take: limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = sellers.length > limit;
    const items = hasMore ? sellers.slice(0, limit) : sellers;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;

    return {
      items: items.map(serializeSeller),
      ...(nextCursor ? { nextCursor } : {}),
    };
  }

  async create(
    data: CreateSellerRequest,
    actor: Actor,
    meta: RequestMeta,
  ): Promise<SellerWithShop> {
    const existingShop = await this.prisma.shop.findUnique({
      where: { slug: data.shop.slug },
    });
    if (existingShop && !existingShop.deletedAt) {
      throw new AppError('SHOP_SLUG_TAKEN', 409, {
        detail: `shop slug '${data.shop.slug}' is already in use`,
      });
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const seller = await tx.seller.create({
        data: {
          accountId: actor.accountId,
          legalName: data.legalName,
          type: data.type,
          country: data.country,
          status: 'approved',
          shop: {
            create: {
              slug: data.shop.slug,
              displayName: data.shop.displayName,
              description: data.shop.description ?? null,
              logoUrl: data.shop.logoUrl ?? null,
              bannerUrl: data.shop.bannerUrl ?? null,
            },
          },
        },
        include: { shop: true },
      });

      await writeSellerOutbox(tx, 'seller', 'seller.created', seller.id, {
        sellerId: seller.id,
        legalName: seller.legalName,
        shopSlug: seller.shop?.slug,
      });

      return seller;
    });

    await this.record(actor, 'seller.create', created.id, meta, {
      after: created,
    });

    return serializeSeller(created);
  }

  async updateStatus(
    id: string,
    data: UpdateSellerStatusRequest,
    actor: Actor,
    meta: RequestMeta,
  ): Promise<SellerWithShop> {
    const existing = await this.prisma.seller.findUnique({
      where: { id },
      include: { shop: true },
    });
    if (!existing || existing.deletedAt) {
      throw new AppError('SELLER_NOT_FOUND', 404, { detail: `seller ${id} not found` });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const seller = await tx.seller.update({
        where: { id },
        data: { status: data.status },
        include: { shop: true },
      });

      await writeSellerOutbox(tx, 'seller', 'seller.status_changed', seller.id, {
        sellerId: seller.id,
        oldStatus: existing.status,
        newStatus: data.status,
        reason: data.reason,
      });

      return seller;
    });

    await this.record(actor, 'seller.status_change', updated.id, meta, {
      before: existing,
      after: updated,
      ...(data.reason ? { reason: data.reason } : {}),
    });

    return serializeSeller(updated);
  }
}
