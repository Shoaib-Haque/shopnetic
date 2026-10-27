import { Injectable } from '@nestjs/common';
import { Permission, Role, assertCan, type Actor } from '@shopnetic/auth';
import {
  REASON_REQUIRED_SELLER_STATUSES,
  VALID_SELLER_STATUS_TRANSITIONS,
  type CreateSellerRequest,
  type SellerStatus,
  type SellerWithShop,
  type Shop,
  type UpdateMyShopRequest,
  type UpdateSellerStatusRequest,
} from '@shopnetic/contracts';
import type { Prisma, Seller as SellerRow, Shop as ShopRow } from '@shopnetic/db';
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
    lastReviewNote: seller.lastReviewNote ?? null,
    commissionOverrideBps: seller.commissionOverrideBps,
    reserveBps: seller.reserveBps,
    createdAt: seller.createdAt.toISOString(),
    updatedAt: seller.updatedAt.toISOString(),
    deletedAt: seller.deletedAt ? seller.deletedAt.toISOString() : null,
    shop: seller.shop ? serializeShop(seller.shop) : null,
  };
}

async function syncSellerGrant(
  tx: Prisma.TransactionClient,
  accountId: string,
  sellerId: string,
  status: SellerStatus,
): Promise<void> {
  const shouldHaveGrant = status === 'approved';
  if (shouldHaveGrant) {
    const sellerRole = await tx.role.findUniqueOrThrow({ where: { key: Role.SELLER } });
    await tx.grant.upsert({
      where: {
        accountId_roleId_scopeType_scopeId: {
          accountId,
          roleId: sellerRole.id,
          scopeType: 'seller',
          scopeId: sellerId,
        },
      },
      update: {},
      create: {
        accountId,
        roleId: sellerRole.id,
        scopeType: 'seller',
        scopeId: sellerId,
      },
    });
  } else {
    const sellerRole = await tx.role.findUnique({ where: { key: Role.SELLER } });
    if (sellerRole) {
      await tx.grant.deleteMany({
        where: {
          accountId,
          roleId: sellerRole.id,
          scopeType: 'seller',
          scopeId: sellerId,
        },
      });
    }
  }
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
    if (!shop || shop.deletedAt || !shop.seller || shop.seller.deletedAt) {
      return null;
    }
    const account = await this.prisma.account.findUnique({
      where: { id: shop.seller.accountId },
      select: { email: true },
    });
    return serializeSeller(shop.seller, account?.email ?? null);
  }

  async isSlugAvailable(slug: string): Promise<boolean> {
    const existing = await this.prisma.shop.findUnique({
      where: { slug },
      select: { id: true, deletedAt: true },
    });
    return !existing || existing.deletedAt !== null;
  }

  async list(
    opts: {
      status?: SellerStatus;
      cursor?: string;
      limit?: number;
      q?: string;
    } = {},
  ): Promise<{ items: SellerWithShop[]; nextCursor?: string | undefined }> {
    const limit = clampLimit(opts.limit ?? DEFAULT_LIMIT, DEFAULT_LIMIT, MAX_LIMIT);
    const tokens = opts.q ? tokenizeForSql(opts.q) : [];

    // If search tokens are provided, execute multi-token ranked query across seller, shop, and identity account
    if (tokens.length > 0) {
      const offset = rankedOffsetFromCursor(opts.cursor);
      const params: unknown[] = [];
      const where: string[] = ['s.deleted_at IS NULL'];
      if (opts.status) {
        params.push(opts.status);
        where.push(`s.status = $${params.length}::seller."SellerStatus"`);
      }

      const primary = `lower(s.legal_name)`;
      const haystack = `lower(concat_ws(' ', s.legal_name, s.country, sh.display_name, sh.slug, (SELECT a.email FROM identity.account a WHERE a.id = s.account_id)))`;
      const { whereSql, scoreSql } = buildTokenSearch(tokens, haystack, params, {
        primarySql: primary,
      });
      where.push(whereSql);

      params.push(limit + 1);
      const limitIdx = params.length;
      params.push(offset);
      const offsetIdx = params.length;

      const sql = `
        SELECT
          s.id, s.account_id AS "accountId", s.legal_name AS "legalName", s.type, s.country,
          s.status, s.last_review_note AS "lastReviewNote", s.commission_override_bps AS "commissionOverrideBps",
          s.reserve_bps AS "reserveBps", s.created_at AS "createdAt", s.updated_at AS "updatedAt",
          s.deleted_at AS "deletedAt",
          sh.id AS "sh_id", sh.seller_id AS "sh_sellerId", sh.slug AS "sh_slug",
          sh.display_name AS "sh_displayName", sh.description AS "sh_description",
          sh.logo_url AS "sh_logoUrl", sh.banner_url AS "sh_bannerUrl",
          sh.vacation_until AS "sh_vacationUntil", sh.created_at AS "sh_createdAt",
          sh.updated_at AS "sh_updatedAt", sh.deleted_at AS "sh_deletedAt",
          (SELECT a.email FROM identity.account a WHERE a.id = s.account_id) AS "accountEmail",
          ${scoreSql} AS rank_score
        FROM seller.seller s
        LEFT JOIN seller.shop sh ON sh.seller_id = s.id AND sh.deleted_at IS NULL
        WHERE ${where.join(' AND ')}
        ORDER BY rank_score DESC, s.created_at DESC, s.id DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `;

      interface RawSearchedSeller {
        id: string;
        accountId: string;
        legalName: string;
        type: 'individual' | 'business';
        country: string;
        status: SellerStatus;
        lastReviewNote: string | null;
        commissionOverrideBps: number | null;
        reserveBps: number | null;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        sh_id: string | null;
        sh_sellerId: string | null;
        sh_slug: string | null;
        sh_displayName: string | null;
        sh_description: string | null;
        sh_logoUrl: string | null;
        sh_bannerUrl: string | null;
        sh_vacationUntil: Date | null;
        sh_createdAt: Date | null;
        sh_updatedAt: Date | null;
        sh_deletedAt: Date | null;
        accountEmail: string | null;
        rank_score: number;
      }

      const rows = await this.prisma.$queryRawUnsafe<RawSearchedSeller[]>(sql, ...params);
      const hasMore = rows.length > limit;
      const sliced = hasMore ? rows.slice(0, limit) : rows;

      const items: SellerWithShop[] = sliced.map((r) => {
        const shop: Shop | null = r.sh_id
          ? {
              id: r.sh_id,
              sellerId: r.sh_sellerId!,
              slug: r.sh_slug!,
              displayName: r.sh_displayName!,
              description: r.sh_description,
              logoUrl: r.sh_logoUrl,
              bannerUrl: r.sh_bannerUrl,
              vacationUntil: r.sh_vacationUntil ? r.sh_vacationUntil.toISOString() : null,
              createdAt: r.sh_createdAt!.toISOString(),
              updatedAt: r.sh_updatedAt!.toISOString(),
              deletedAt: r.sh_deletedAt ? r.sh_deletedAt.toISOString() : null,
            }
          : null;

        return {
          id: r.id,
          accountId: r.accountId,
          accountEmail: r.accountEmail,
          legalName: r.legalName,
          type: r.type,
          country: r.country,
          status: r.status,
          lastReviewNote: r.lastReviewNote,
          commissionOverrideBps: r.commissionOverrideBps,
          reserveBps: r.reserveBps,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
          deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
          shop,
        };
      });

      const nextCursor = rankedNextCursor(rows.length, limit, offset);
      return { items, ...(nextCursor ? { nextCursor } : {}) };
    }

    const rows = await this.prisma.seller.findMany({
      where: {
        deletedAt: null,
        ...(opts.status ? { status: opts.status } : {}),
      },
      include: { shop: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });

    const { page, nextCursor } = paginate(rows, limit);

    const accountIds = page.map((s) => s.accountId);
    const accounts =
      accountIds.length > 0
        ? await this.prisma.account.findMany({
            where: { id: { in: accountIds } },
            select: { id: true, email: true },
          })
        : [];
    const emailByAccountId = new Map(accounts.map((a) => [a.id, a.email]));

    const items = page.map((s) => serializeSeller(s, emailByAccountId.get(s.accountId) ?? null));
    return { items, ...(nextCursor ? { nextCursor } : {}) };
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
          lastReviewNote: null,
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

      await syncSellerGrant(tx, seller.accountId, seller.id, seller.status);

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

  async registerSelf(
    data: CreateSellerRequest,
    actor: Actor,
    meta: RequestMeta,
  ): Promise<SellerWithShop> {
    const existing = await this.prisma.seller.findUnique({
      where: { accountId: actor.accountId },
    });
    if (existing) {
      throw new AppError('SELLER_ALREADY_EXISTS', 409, {
        detail: 'an account can only have one seller application',
      });
    }

    const existingShop = await this.prisma.shop.findUnique({
      where: { slug: data.shop.slug },
    });
    if (existingShop && !existingShop.deletedAt) {
      throw new AppError('SHOP_SLUG_TAKEN', 409, {
        detail: `shop slug '${data.shop.slug}' is already in use`,
      });
    }

    const { created, updated } = await this.prisma.$transaction(async (tx) => {
      // Step 1: Insert at draft
      const seller = await tx.seller.create({
        data: {
          accountId: actor.accountId,
          legalName: data.legalName,
          type: data.type,
          country: data.country,
          status: 'draft',
          lastReviewNote: null,
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

      // Step 2: Immediately execute guarded transition draft -> in_review
      const allowed = VALID_SELLER_STATUS_TRANSITIONS['draft'];
      if (!allowed.includes('in_review')) {
        throw new AppError('SELLER_STATUS_TRANSITION_INVALID', 422);
      }

      const inReviewSeller = await tx.seller.update({
        where: { id: seller.id },
        data: { status: 'in_review', lastReviewNote: null },
        include: { shop: true },
      });

      await syncSellerGrant(tx, inReviewSeller.accountId, inReviewSeller.id, inReviewSeller.status);

      await writeSellerOutbox(tx, 'seller', 'seller.status_changed', inReviewSeller.id, {
        sellerId: inReviewSeller.id,
        oldStatus: 'draft',
        newStatus: 'in_review',
      });

      return { created: seller, updated: inReviewSeller };
    });

    await this.record(actor, 'seller.create', created.id, meta, {
      after: created,
    });
    await this.record(actor, 'seller.status_change', updated.id, meta, {
      before: created,
      after: updated,
    });

    const account = await this.prisma.account.findUnique({
      where: { id: actor.accountId },
      select: { email: true },
    });
    return serializeSeller(updated, account?.email ?? null);
  }

  async resubmitSelf(
    data: CreateSellerRequest,
    actor: Actor,
    meta: RequestMeta,
  ): Promise<SellerWithShop> {
    const existing = await this.prisma.seller.findUnique({
      where: { accountId: actor.accountId },
      include: { shop: true },
    });
    if (!existing || existing.deletedAt) {
      throw new AppError('SELLER_NOT_FOUND', 404, { detail: 'no seller application found' });
    }
    if (existing.status !== 'draft') {
      throw new AppError('SELLER_STATUS_TRANSITION_INVALID', 422, {
        detail: `cannot resubmit application in status '${existing.status}'`,
      });
    }

    if (existing.shop && data.shop.slug !== existing.shop.slug) {
      const slugTaken = await this.prisma.shop.findUnique({
        where: { slug: data.shop.slug },
      });
      if (slugTaken && !slugTaken.deletedAt) {
        throw new AppError('SHOP_SLUG_TAKEN', 409, {
          detail: `shop slug '${data.shop.slug}' is already in use`,
        });
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const seller = await tx.seller.update({
        where: { id: existing.id },
        data: {
          legalName: data.legalName,
          type: data.type,
          country: data.country,
          status: 'in_review',
          lastReviewNote: null,
          shop: existing.shop
            ? {
                update: {
                  slug: data.shop.slug,
                  displayName: data.shop.displayName,
                  description: data.shop.description ?? null,
                  logoUrl: data.shop.logoUrl ?? null,
                  bannerUrl: data.shop.bannerUrl ?? null,
                },
              }
            : {
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

      await syncSellerGrant(tx, seller.accountId, seller.id, seller.status);

      await writeSellerOutbox(tx, 'seller', 'seller.status_changed', seller.id, {
        sellerId: seller.id,
        oldStatus: 'draft',
        newStatus: 'in_review',
      });

      return seller;
    });

    await this.record(actor, 'seller.status_change', updated.id, meta, {
      before: existing,
      after: updated,
    });

    const account = await this.prisma.account.findUnique({
      where: { id: actor.accountId },
      select: { email: true },
    });
    return serializeSeller(updated, account?.email ?? null);
  }

  async updateMyShop(
    actor: Actor,
    data: UpdateMyShopRequest,
    meta: RequestMeta,
  ): Promise<SellerWithShop> {
    const seller = await this.prisma.seller.findUnique({
      where: { accountId: actor.accountId },
      include: { shop: true },
    });
    if (!seller || seller.deletedAt) {
      throw new AppError('SELLER_NOT_FOUND', 404, { detail: 'seller not found' });
    }
    if (!seller.shop) {
      throw new AppError('SHOP_NOT_FOUND', 404, { detail: 'shop not found' });
    }

    assertCan(actor, Permission.SHOP_MANAGE, { sellerId: seller.id });

    if (
      data.expectedUpdatedAt !== undefined &&
      data.expectedUpdatedAt !== seller.shop.updatedAt.toISOString()
    ) {
      throw new AppError('CONFLICT', 409, {
        detail: 'shop was modified concurrently; reload and try again',
      });
    }

    const updatedShop = await this.prisma.shop.update({
      where: { id: seller.shop.id },
      data: {
        ...(data.displayName !== undefined ? { displayName: data.displayName } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.logoUrl !== undefined ? { logoUrl: data.logoUrl } : {}),
        ...(data.bannerUrl !== undefined ? { bannerUrl: data.bannerUrl } : {}),
        ...(data.vacationUntil !== undefined
          ? { vacationUntil: data.vacationUntil ? new Date(data.vacationUntil) : null }
          : {}),
      },
    });

    await this.record(actor, 'seller.shop_update', seller.id, meta, {
      before: seller.shop,
      after: updatedShop,
    });

    const refreshed = await this.prisma.seller.findUniqueOrThrow({
      where: { id: seller.id },
      include: { shop: true },
    });

    const account = await this.prisma.account.findUnique({
      where: { id: actor.accountId },
      select: { email: true },
    });
    return serializeSeller(refreshed, account?.email ?? null);
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

    const isReasonRequired = (REASON_REQUIRED_SELLER_STATUSES as readonly string[]).includes(
      data.status,
    );
    if (isReasonRequired && (!data.reason || data.reason.trim().length < 5)) {
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
      const updateData: { status: SellerStatus; lastReviewNote?: string | null } = {
        status: data.status,
      };
      if (data.status === 'draft') {
        updateData.lastReviewNote = data.reason?.trim() ?? null;
      } else if (data.status === 'in_review') {
        updateData.lastReviewNote = null;
      }

      const seller = await tx.seller.update({
        where: { id },
        data: updateData,
        include: { shop: true },
      });

      await syncSellerGrant(tx, seller.accountId, seller.id, seller.status);

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
