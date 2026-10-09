import { Injectable } from '@nestjs/common';
import { assertCan, Permission, type Actor } from '@shopnetic/auth';
import {
  createOfferRequestSchema,
  type CreateOfferRequest,
  type ListOffersQuery,
  type Offer,
  type StockLevel,
  type UpdateOfferRequest,
} from '@shopnetic/contracts';
import type {
  Offer as OfferRow,
  Prisma,
  Stock as StockRow,
  Warehouse as WarehouseRow,
} from '@shopnetic/db';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppError } from '../common/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import { auditRecordFor } from '../audit/audit-record-for.js';
import { clampLimit } from '../common/pagination.js';
import type { RequestMeta } from '../identity/identity.service.js';
import { BuyboxService } from './buybox.service.js';
import { writeInventoryOutbox } from './inventory-outbox.js';

type OfferWithRelations = OfferRow & {
  stocks: (StockRow & { warehouse: WarehouseRow })[];
};

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

@Injectable()
export class OfferService {
  private readonly record: ReturnType<typeof auditRecordFor>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly buybox: BuyboxService,
  ) {
    this.record = auditRecordFor(this.audit, 'offer');
  }

  private async serialize(offer: OfferWithRelations): Promise<Offer> {
    const seller = await this.prisma.seller.findUnique({
      where: { id: offer.sellerId },
      include: { shop: true },
    });
    const variant = await this.prisma.variant.findUnique({
      where: { id: offer.variantId },
    });
    const buybox = await this.prisma.buybox.findUnique({
      where: { variantId: offer.variantId },
    });

    const stocks: StockLevel[] = offer.stocks.map((s) => ({
      id: s.id,
      warehouseId: s.warehouseId,
      warehouseName: s.warehouse.name,
      onHand: s.onHand,
      reserved: s.reserved,
      available: Math.max(0, s.onHand - s.reserved),
      safetyStock: s.safetyStock,
      backorder: s.backorder,
      restockEta: s.restockEta ? s.restockEta.toISOString() : null,
    }));

    const totalOnHand = stocks.reduce((sum, s) => sum + s.onHand, 0);
    const totalAvailable = stocks.reduce((sum, s) => sum + s.available, 0);
    const isBuyboxWinner = buybox?.winningOfferId === offer.id;

    return {
      id: offer.id,
      sellerId: offer.sellerId,
      sellerName: seller?.shop?.displayName ?? seller?.legalName ?? 'Unknown Seller',
      shopSlug: seller?.shop?.slug ?? '',
      variantId: offer.variantId,
      skuCode: variant?.skuCode ?? '',
      priceMinor: offer.priceMinor.toString(),
      currency: offer.currency,
      salePriceMinor: offer.salePriceMinor != null ? offer.salePriceMinor.toString() : null,
      saleStartsAt: offer.saleStartsAt ? offer.saleStartsAt.toISOString() : null,
      saleEndsAt: offer.saleEndsAt ? offer.saleEndsAt.toISOString() : null,
      compareAtMinor: offer.compareAtMinor != null ? offer.compareAtMinor.toString() : null,
      condition: offer.condition,
      conditionNotes: offer.conditionNotes,
      handlingDays: offer.handlingDays,
      status: offer.status,
      minQty: offer.minQty,
      maxQty: offer.maxQty,
      stocks,
      totalOnHand,
      totalAvailable,
      isBuyboxWinner,
      createdAt: offer.createdAt.toISOString(),
      updatedAt: offer.updatedAt.toISOString(),
      deletedAt: offer.deletedAt ? offer.deletedAt.toISOString() : null,
    };
  }

  async get(id: string): Promise<Offer> {
    const offer = await this.prisma.offer.findUnique({
      where: { id },
      include: {
        stocks: {
          include: { warehouse: true },
        },
      },
    });
    if (!offer || offer.deletedAt) {
      throw new AppError('OFFER_NOT_FOUND', 404, { detail: `offer ${id} not found` });
    }
    return this.serialize(offer);
  }

  async list(query: ListOffersQuery): Promise<{ items: Offer[]; nextCursor?: string }> {
    const limit = clampLimit(query.limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT);
    const where: Prisma.OfferWhereInput = {
      deletedAt: null,
      ...(query.variantId ? { variantId: query.variantId } : {}),
      ...(query.sellerId ? { sellerId: query.sellerId } : {}),
      ...(query.status === 'active' ? { status: 'active' } : {}),
    };

    const offers = await this.prisma.offer.findMany({
      where,
      include: {
        stocks: {
          include: { warehouse: true },
        },
      },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = offers.length > limit;
    const items = hasMore ? offers.slice(0, limit) : offers;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;

    const serialized = await Promise.all(items.map((o) => this.serialize(o)));
    return {
      items: serialized,
      ...(nextCursor ? { nextCursor } : {}),
    };
  }

  async listByVariant(variantId: string): Promise<Offer[]> {
    const offers = await this.prisma.offer.findMany({
      where: {
        variantId,
        status: 'active',
        deletedAt: null,
      },
      include: {
        stocks: {
          include: { warehouse: true },
        },
      },
      orderBy: [{ priceMinor: 'asc' }],
    });
    return Promise.all(offers.map((o) => this.serialize(o)));
  }

  async listByProduct(productId: string): Promise<Offer[]> {
    const variants = await this.prisma.variant.findMany({
      where: { productId, deletedAt: null },
      select: { id: true },
    });
    if (variants.length === 0) return [];

    const variantIds = variants.map((v) => v.id);
    const offers = await this.prisma.offer.findMany({
      where: {
        variantId: { in: variantIds },
        status: 'active',
        deletedAt: null,
      },
      include: {
        stocks: {
          include: { warehouse: true },
        },
      },
    });
    return Promise.all(offers.map((o) => this.serialize(o)));
  }

  async create(
    sellerId: string,
    raw: CreateOfferRequest,
    actor: Actor,
    meta: RequestMeta,
  ): Promise<Offer> {
    assertCan(actor, Permission.OFFER_MANAGE, { sellerId });
    const data = createOfferRequestSchema.parse(raw);

    const seller = await this.prisma.seller.findUnique({
      where: { id: sellerId },
    });
    if (!seller || seller.deletedAt) {
      throw new AppError('SELLER_NOT_FOUND', 404, { detail: `seller ${sellerId} not found` });
    }
    if (seller.status !== 'approved') {
      throw new AppError('SELLER_NOT_APPROVED', 403, {
        detail: `seller ${sellerId} is not approved (status: ${seller.status})`,
      });
    }

    const variant = await this.prisma.variant.findUnique({
      where: { id: data.variantId },
    });
    if (!variant || variant.deletedAt || variant.status !== 'active') {
      throw new AppError('OFFER_VARIANT_INVALID', 422, {
        detail: `variant ${data.variantId} is invalid or inactive`,
      });
    }

    const existing = await this.prisma.offer.findFirst({
      where: { sellerId, variantId: data.variantId, deletedAt: null },
    });
    if (existing) {
      throw new AppError('OFFER_ALREADY_EXISTS', 409, {
        detail: `active offer already exists for seller ${sellerId} and variant ${data.variantId}`,
      });
    }

    const priceMinor = BigInt(data.priceMinor);
    if (priceMinor <= 0n) {
      throw new AppError('OFFER_PRICE_INVALID', 422, { detail: 'price must be positive' });
    }

    const salePriceMinor = data.salePriceMinor ? BigInt(data.salePriceMinor) : null;
    const compareAtMinor = data.compareAtMinor ? BigInt(data.compareAtMinor) : null;

    const created = await this.prisma.$transaction(async (tx) => {
      const offer = await tx.offer.create({
        data: {
          sellerId,
          variantId: data.variantId,
          priceMinor,
          currency: data.currency,
          salePriceMinor,
          saleStartsAt: data.saleStartsAt ? new Date(data.saleStartsAt) : null,
          saleEndsAt: data.saleEndsAt ? new Date(data.saleEndsAt) : null,
          compareAtMinor,
          condition: data.condition,
          conditionNotes: data.conditionNotes ?? null,
          handlingDays: data.handlingDays,
          status: 'active',
          minQty: data.minQty,
          maxQty: data.maxQty ?? null,
        },
      });

      if (data.initialStock > 0) {
        let warehouseId = data.warehouseId;
        if (!warehouseId) {
          const defaultWarehouse = await tx.warehouse.findFirst({
            where: { sellerId, isDefault: true, deletedAt: null },
          });
          if (defaultWarehouse) {
            warehouseId = defaultWarehouse.id;
          } else {
            const anyWarehouse = await tx.warehouse.findFirst({
              where: { sellerId, deletedAt: null },
            });
            if (anyWarehouse) {
              warehouseId = anyWarehouse.id;
            } else {
              const createdWh = await tx.warehouse.create({
                data: {
                  sellerId,
                  name: 'Default Warehouse',
                  isDefault: true,
                  address: {
                    line1: '1 Main St',
                    city: 'Austin',
                    state: 'TX',
                    postalCode: '78701',
                    country: 'US',
                  },
                },
              });
              warehouseId = createdWh.id;
            }
          }
        }

        await tx.stock.create({
          data: {
            offerId: offer.id,
            warehouseId,
            onHand: data.initialStock,
          },
        });
      }

      await this.buybox.recalculate(data.variantId, tx);

      await writeInventoryOutbox(tx, 'offer', 'offer.created', offer.id, {
        offerId: offer.id,
        sellerId,
        variantId: data.variantId,
        priceMinor: data.priceMinor,
        currency: data.currency,
      });

      return tx.offer.findUniqueOrThrow({
        where: { id: offer.id },
        include: {
          stocks: {
            include: { warehouse: true },
          },
        },
      });
    });

    await this.record(actor, 'offer.create', created.id, meta, {
      after: created,
    });

    return this.serialize(created);
  }

  async update(
    id: string,
    data: UpdateOfferRequest,
    actor: Actor,
    meta: RequestMeta,
  ): Promise<Offer> {
    const existing = await this.prisma.offer.findUnique({
      where: { id },
      include: {
        stocks: {
          include: { warehouse: true },
        },
      },
    });
    if (!existing || existing.deletedAt) {
      throw new AppError('OFFER_NOT_FOUND', 404, { detail: `offer ${id} not found` });
    }

    assertCan(actor, Permission.OFFER_MANAGE, { sellerId: existing.sellerId });

    if (data.priceMinor && BigInt(data.priceMinor) <= 0n) {
      throw new AppError('OFFER_PRICE_INVALID', 422, { detail: 'price must be positive' });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const offer = await tx.offer.update({
        where: { id },
        data: {
          ...(data.priceMinor ? { priceMinor: BigInt(data.priceMinor) } : {}),
          ...(data.currency ? { currency: data.currency } : {}),
          ...(data.salePriceMinor !== undefined
            ? { salePriceMinor: data.salePriceMinor ? BigInt(data.salePriceMinor) : null }
            : {}),
          ...(data.saleStartsAt !== undefined
            ? { saleStartsAt: data.saleStartsAt ? new Date(data.saleStartsAt) : null }
            : {}),
          ...(data.saleEndsAt !== undefined
            ? { saleEndsAt: data.saleEndsAt ? new Date(data.saleEndsAt) : null }
            : {}),
          ...(data.compareAtMinor !== undefined
            ? { compareAtMinor: data.compareAtMinor ? BigInt(data.compareAtMinor) : null }
            : {}),
          ...(data.condition ? { condition: data.condition } : {}),
          ...(data.conditionNotes !== undefined ? { conditionNotes: data.conditionNotes } : {}),
          ...(data.handlingDays !== undefined ? { handlingDays: data.handlingDays } : {}),
          ...(data.status ? { status: data.status } : {}),
          ...(data.minQty !== undefined ? { minQty: data.minQty } : {}),
          ...(data.maxQty !== undefined ? { maxQty: data.maxQty } : {}),
        },
        include: {
          stocks: {
            include: { warehouse: true },
          },
        },
      });

      await this.buybox.recalculate(existing.variantId, tx);

      await writeInventoryOutbox(tx, 'offer', 'offer.updated', offer.id, {
        offerId: offer.id,
        sellerId: existing.sellerId,
        variantId: existing.variantId,
      });

      return offer;
    });

    await this.record(actor, 'offer.update', updated.id, meta, {
      before: existing,
      after: updated,
    });

    return this.serialize(updated);
  }

  async remove(id: string, actor: Actor, meta: RequestMeta): Promise<void> {
    const existing = await this.prisma.offer.findUnique({
      where: { id },
    });
    if (!existing || existing.deletedAt) {
      throw new AppError('OFFER_NOT_FOUND', 404, { detail: `offer ${id} not found` });
    }

    assertCan(actor, Permission.OFFER_MANAGE, { sellerId: existing.sellerId });

    const updated = await this.prisma.$transaction(async (tx) => {
      const offer = await tx.offer.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      await this.buybox.recalculate(existing.variantId, tx);

      await writeInventoryOutbox(tx, 'offer', 'offer.deleted', offer.id, {
        offerId: offer.id,
        sellerId: existing.sellerId,
        variantId: existing.variantId,
      });

      return offer;
    });

    await this.record(actor, 'offer.delete', updated.id, meta, {
      before: existing,
      after: updated,
    });
  }
}
