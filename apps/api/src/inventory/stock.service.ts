import { Injectable } from '@nestjs/common';
import { assertCan, Permission, type Actor } from '@shopnetic/auth';
import {
  updateStockRequestSchema,
  type StockLevel,
  type UpdateStockRequest,
} from '@shopnetic/contracts';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppError } from '../common/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import { auditRecordFor } from '../audit/audit-record-for.js';
import type { RequestMeta } from '../identity/identity.service.js';
import { BuyboxService } from './buybox.service.js';
import { writeInventoryOutbox } from './inventory-outbox.js';

@Injectable()
export class StockService {
  private readonly record: ReturnType<typeof auditRecordFor>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly buybox: BuyboxService,
  ) {
    this.record = auditRecordFor(this.audit, 'stock');
  }

  async update(
    offerId: string,
    warehouseId: string,
    raw: UpdateStockRequest,
    actor: Actor,
    meta: RequestMeta,
  ): Promise<StockLevel> {
    const data = updateStockRequestSchema.parse(raw);
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
    });
    if (!offer || offer.deletedAt) {
      throw new AppError('OFFER_NOT_FOUND', 404, { detail: `offer ${offerId} not found` });
    }

    assertCan(actor, Permission.INVENTORY_MANAGE, { sellerId: offer.sellerId });

    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
    });
    if (!warehouse || warehouse.deletedAt || warehouse.sellerId !== offer.sellerId) {
      throw new AppError('WAREHOUSE_NOT_FOUND', 404, {
        detail: `warehouse ${warehouseId} not found for seller ${offer.sellerId}`,
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const existingStock = await tx.stock.findUnique({
        where: { offerId_warehouseId: { offerId, warehouseId } },
      });

      const stock = await tx.stock.upsert({
        where: { offerId_warehouseId: { offerId, warehouseId } },
        update: {
          onHand: data.onHand,
          safetyStock: data.safetyStock,
          backorder: data.backorder,
          restockEta: data.restockEta ? new Date(data.restockEta) : null,
        },
        create: {
          offerId,
          warehouseId,
          onHand: data.onHand,
          safetyStock: data.safetyStock,
          backorder: data.backorder,
          restockEta: data.restockEta ? new Date(data.restockEta) : null,
        },
      });

      await this.buybox.recalculate(offer.variantId, tx);

      await writeInventoryOutbox(tx, 'stock', 'stock.updated', stock.id, {
        stockId: stock.id,
        offerId,
        warehouseId,
        onHand: stock.onHand,
      });

      return { stock, existingStock };
    });

    await this.record(actor, 'stock.update', updated.stock.id, meta, {
      before: updated.existingStock,
      after: updated.stock,
    });

    const available = Math.max(0, updated.stock.onHand - updated.stock.reserved);

    return {
      id: updated.stock.id,
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      onHand: updated.stock.onHand,
      reserved: updated.stock.reserved,
      available,
      safetyStock: updated.stock.safetyStock,
      backorder: updated.stock.backorder,
      restockEta: updated.stock.restockEta ? updated.stock.restockEta.toISOString() : null,
    };
  }
}
