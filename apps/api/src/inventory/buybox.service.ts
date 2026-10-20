import { Injectable } from '@nestjs/common';
import { currencySchema, type Buybox } from '@shopnetic/contracts';
import type { Prisma } from '@shopnetic/db';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class BuyboxService {
  constructor(private readonly prisma: PrismaService) {}

  async get(variantId: string): Promise<Buybox | null> {
    const row = await this.prisma.buybox.findUnique({
      where: { variantId },
    });
    if (!row) return null;

    return {
      variantId: row.variantId,
      winningOfferId: row.winningOfferId,
      winningSellerId: row.winningSellerId,
      winningSellerName: row.winningSellerName,
      winningPriceMinor: row.winningPriceMinor != null ? row.winningPriceMinor.toString() : null,
      winningCurrency: row.winningCurrency ? currencySchema.parse(row.winningCurrency) : null,
      sellerCount: row.sellerCount,
      minPriceMinor: row.minPriceMinor != null ? row.minPriceMinor.toString() : null,
      maxPriceMinor: row.maxPriceMinor != null ? row.maxPriceMinor.toString() : null,
      computedAt: row.computedAt.toISOString(),
    };
  }

  async recalculate(variantId: string, tx?: Prisma.TransactionClient): Promise<Buybox> {
    if (!tx) {
      return this.prisma.$transaction((innerTx) => this.recalculate(variantId, innerTx));
    }
    const client = tx;

    // Serialize concurrent recalculations for this variant via transaction-scoped advisory lock
    await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`buybox:${variantId}`}))`;

    const offers = await client.offer.findMany({
      where: {
        variantId,
        status: 'active',
        deletedAt: null,
      },
      include: {
        stocks: true,
      },
    });

    const now = new Date();
    const getEffectivePrice = (o: (typeof offers)[0]): bigint => {
      if (o.salePriceMinor != null) {
        const started = !o.saleStartsAt || o.saleStartsAt <= now;
        const notEnded = !o.saleEndsAt || o.saleEndsAt >= now;
        if (started && notEnded) {
          return o.salePriceMinor;
        }
      }
      return o.priceMinor;
    };

    const withAvailability = offers.map((o) => {
      const totalAvailable = o.stocks.reduce(
        (sum, s) => sum + Math.max(0, s.onHand - s.reserved),
        0,
      );
      const allowsBackorder = o.stocks.some((s) => s.backorder);
      return {
        offer: o,
        effectivePrice: getEffectivePrice(o),
        totalAvailable,
        allowsBackorder,
      };
    });

    const qualifyingOffers = withAvailability.filter(
      (item) => item.totalAvailable > 0 || item.allowsBackorder,
    );

    // Candidates: in-stock or backorder-tolerant active offers qualify for the buybox.
    // If no active offer qualifies, there is no winning offer.
    const sorted = [...qualifyingOffers].sort((a, b) => {
      if (a.effectivePrice < b.effectivePrice) return -1;
      if (a.effectivePrice > b.effectivePrice) return 1;
      // Secondary: higher total available
      if (a.totalAvailable > b.totalAvailable) return -1;
      if (a.totalAvailable < b.totalAvailable) return 1;
      // Tertiary: lower handling days
      if (a.offer.handlingDays < b.offer.handlingDays) return -1;
      if (a.offer.handlingDays > b.offer.handlingDays) return 1;
      return a.offer.createdAt.getTime() - b.offer.createdAt.getTime();
    });

    const winner = sorted[0];

    const allPrices = offers.map(getEffectivePrice);
    const minPriceMinor = allPrices.length > 0 ? allPrices.reduce((m, p) => (p < m ? p : m)) : null;
    const maxPriceMinor = allPrices.length > 0 ? allPrices.reduce((m, p) => (p > m ? p : m)) : null;
    const sellerCount = new Set(offers.map((o) => o.sellerId)).size;

    let winningSellerName: string | null = null;
    if (winner) {
      const seller = await client.seller.findUnique({
        where: { id: winner.offer.sellerId },
        include: { shop: true },
      });
      winningSellerName = seller?.shop?.displayName ?? seller?.legalName ?? null;
    }

    const updated = await client.buybox.upsert({
      where: { variantId },
      update: {
        winningOfferId: winner ? winner.offer.id : null,
        winningSellerId: winner ? winner.offer.sellerId : null,
        winningSellerName,
        winningPriceMinor: winner ? winner.effectivePrice : null,
        winningCurrency: winner ? winner.offer.currency : null,
        sellerCount,
        minPriceMinor,
        maxPriceMinor,
        computedAt: new Date(),
      },
      create: {
        variantId,
        winningOfferId: winner ? winner.offer.id : null,
        winningSellerId: winner ? winner.offer.sellerId : null,
        winningSellerName,
        winningPriceMinor: winner ? winner.effectivePrice : null,
        winningCurrency: winner ? winner.offer.currency : null,
        sellerCount,
        minPriceMinor,
        maxPriceMinor,
        computedAt: new Date(),
      },
    });

    return {
      variantId: updated.variantId,
      winningOfferId: updated.winningOfferId,
      winningSellerId: updated.winningSellerId,
      winningSellerName: updated.winningSellerName,
      winningPriceMinor:
        updated.winningPriceMinor != null ? updated.winningPriceMinor.toString() : null,
      winningCurrency: updated.winningCurrency
        ? currencySchema.parse(updated.winningCurrency)
        : null,
      sellerCount: updated.sellerCount,
      minPriceMinor: updated.minPriceMinor != null ? updated.minPriceMinor.toString() : null,
      maxPriceMinor: updated.maxPriceMinor != null ? updated.maxPriceMinor.toString() : null,
      computedAt: updated.computedAt.toISOString(),
    };
  }
}
