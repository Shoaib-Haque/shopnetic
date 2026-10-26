import { Injectable } from '@nestjs/common';
import type { Actor } from '@shopnetic/auth';
import {
  VALID_SELLER_STATUS_TRANSITIONS,
  type CreateSellerRequest,
  type SellerStatus,
  type SellerWithShop,
  type Shop,
  type UpdateSellerStatusRequest,
} from '@shopnetic/contracts';
import type { Seller as SellerRow, Shop as ShopRow } from '@shopnetic/db';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppError } from '../common/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import { auditRecordFor } from '../audit/audit-record-for.js';
import { clampLimit, paginate } from '../common/pagination.js';
import {
  tokenizeForSql,
  buildTokenSearch,
  rankedOffsetFromCursor,
  rankedNextCursor,
} from '../common/text-search.js';
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

function serializeSeller(
  seller: SellerRow & { shop: ShopRow | null },
  accountEmail?: string | null,
): SellerWithShop {
  return {
    id: seller.id,
    accountId: seller.accountId,
    accountEmail: accountEmail ?? null,
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
    const account = await this.prisma.account.findUnique({
      where: { id: seller.accountId },
      select: { email: true },
    });
    return serializeSeller(seller, account?.email ?? null);
  }

  async getByAccountId(accountId: string): Promise<SellerWithShop | null> {
    const seller = await this.prisma.seller.findUnique({
      where: { accountId },
      include: { shop: true },
    });
    if (!seller || seller.deletedAt) return null;
    const account = await this.prisma.account.findUnique({
      where: { id: seller.accountId },
      select: { email: true },
    });
    return serializeSeller(seller, account?.email ?? null);
  }

  async getByShopSlug(slug: string): Promise<SellerWithShop | null> {
    const shop = await this.prisma.shop.findUnique({
      where: { slug },
      include: { seller: { include: { shop: true } } },
    });
    if (!shop || shop.deletedAt || shop.seller.deletedAt) return null;
    const account = await this.prisma.account.findUnique({
      where: { id: shop.seller.accountId },
      select: { email: true },
    });
    return serializeSeller(shop.seller, account?.email ?? null);
  }

  async list(opts: {
    status?: SellerStatus;
    cursor?: string;
    limit?: number;
    q?: string;
  }): Promise<{ items: SellerWithShop[]; nextCursor?: string }> {
    const limit = clampLimit(opts.limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT);
    const tokens = opts.q ? tokenizeForSql(opts.q) : [];
    const isSearch = tokens.length > 0;

    const params: unknown[] = [];
    const where: string[] = ['s.deleted_at IS NULL'];

    if (opts.status) {
      params.push(opts.status);
      where.push(`s.status::text = $${params.length}`);
    }

    let scoreExpr = '0';
    if (isSearch) {
      const primary = 'lower(s.legal_name)';
      const haystack = `lower(
        s.legal_name || ' ' || s.country || ' ' ||
        coalesce((SELECT sh.display_name || ' ' || sh.slug FROM seller.shop sh WHERE sh.seller_id = s.id AND sh.deleted_at IS NULL LIMIT 1), '') || ' ' ||
        coalesce((SELECT a.email FROM identity.account a WHERE a.id = s.account_id), '')
      )`;
      const { whereSql, scoreSql } = buildTokenSearch(tokens, haystack, params, {
        primarySql: primary,
      });
      where.push(whereSql);
      scoreExpr = scoreSql;
    }

    if (opts.cursor && !isSearch) {
      params.push(opts.cursor);
      where.push(`s.id < $${params.length}::uuid`);
    }

    const offset = isSearch ? rankedOffsetFromCursor(opts.cursor) : 0;
    const idRows = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT s.id
         FROM seller.seller s
        WHERE ${where.join(' AND ')}
        ORDER BY ${isSearch ? `${scoreExpr} DESC, ` : ''}s.id DESC
        LIMIT ${limit + 1}${isSearch ? ` OFFSET ${offset}` : ''}`,
      ...params,
    );

    const { page: idPage, nextCursor: keysetCursor } = paginate(idRows, limit);
    const nextCursor = isSearch ? rankedNextCursor(idRows.length, limit, offset) : keysetCursor;

    const orderedIds = idPage.map((r) => r.id);
    if (orderedIds.length === 0) {
      return { items: [], ...(nextCursor ? { nextCursor } : {}) };
    }

    const unorderedRows = await this.prisma.seller.findMany({
      where: { id: { in: orderedIds } },
      include: { shop: true },
    });
    const byId = new Map(unorderedRows.map((r) => [r.id, r]));
    const rows = orderedIds.flatMap((id) => {
      const row = byId.get(id);
      return row ? [row] : [];
    });

    // Batched cross-schema lookup for account emails (no N+1)
    const accountIds = [...new Set(rows.map((s) => s.accountId))];
    const accounts =
      accountIds.length > 0
        ? await this.prisma.account.findMany({
            where: { id: { in: accountIds } },
            select: { id: true, email: true },
          })
        : [];
    const emailByAccountId = new Map(accounts.map((a) => [a.id, a.email]));

    return {
      items: rows.map((s) => serializeSeller(s, emailByAccountId.get(s.accountId) ?? null)),
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

    const account = await this.prisma.account.findUnique({
      where: { id: created.accountId },
      select: { email: true },
    });
    return serializeSeller(created, account?.email ?? null);
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

    const allowedTransitions = VALID_SELLER_STATUS_TRANSITIONS[existing.status];
    if (!allowedTransitions.includes(data.status)) {
      throw new AppError('SELLER_STATUS_TRANSITION_INVALID', 422, {
        detail: `cannot transition seller status from '${existing.status}' to '${data.status}'`,
      });
    }

    const isDisciplinary =
      data.status === 'suspended' || data.status === 'offboarding' || data.status === 'closed';
    if (isDisciplinary && (!data.reason || data.reason.trim().length < 5)) {
      throw new AppError('SELLER_STATUS_REASON_REQUIRED', 422, {
        detail: 'A reason with at least 5 characters is required for this status change',
      });
    }

    if (
      data.expectedUpdatedAt !== undefined &&
      data.expectedUpdatedAt !== existing.updatedAt.toISOString()
    ) {
      throw new AppError('CONFLICT', 409, {
        detail: 'seller was modified concurrently; reload and try again',
      });
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

    const account = await this.prisma.account.findUnique({
      where: { id: updated.accountId },
      select: { email: true },
    });
    return serializeSeller(updated, account?.email ?? null);
  }
}
