import { Injectable } from '@nestjs/common';
import type { Actor } from '@shopnetic/auth';
import {
  warehouseAddressSchema,
  createWarehouseRequestSchema,
  type CreateWarehouseRequest,
  type Warehouse,
} from '@shopnetic/contracts';
import type { Warehouse as WarehouseRow } from '@shopnetic/db';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppError } from '../common/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import { auditRecordFor } from '../audit/audit-record-for.js';
import type { RequestMeta } from '../identity/identity.service.js';
import { writeInventoryOutbox } from './inventory-outbox.js';

function serializeWarehouse(row: WarehouseRow): Warehouse {
  return {
    id: row.id,
    sellerId: row.sellerId,
    name: row.name,
    isDefault: row.isDefault,
    address: warehouseAddressSchema.parse(row.address),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
  };
}

@Injectable()
export class WarehouseService {
  private readonly record: ReturnType<typeof auditRecordFor>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {
    this.record = auditRecordFor(this.audit, 'warehouse');
  }

  async get(id: string): Promise<Warehouse> {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id },
    });
    if (!warehouse || warehouse.deletedAt) {
      throw new AppError('WAREHOUSE_NOT_FOUND', 404, { detail: `warehouse ${id} not found` });
    }
    return serializeWarehouse(warehouse);
  }

  async list(sellerId: string): Promise<Warehouse[]> {
    const warehouses = await this.prisma.warehouse.findMany({
      where: { sellerId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return warehouses.map(serializeWarehouse);
  }

  async create(
    sellerId: string,
    raw: CreateWarehouseRequest,
    actor: Actor,
    meta: RequestMeta,
  ): Promise<Warehouse> {
    const data = createWarehouseRequestSchema.parse(raw);
    const created = await this.prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.warehouse.updateMany({
          where: { sellerId, isDefault: true },
          data: { isDefault: false },
        });
      }

      const warehouse = await tx.warehouse.create({
        data: {
          sellerId,
          name: data.name,
          isDefault: data.isDefault,
          address: data.address,
        },
      });

      await writeInventoryOutbox(tx, 'warehouse', 'warehouse.created', warehouse.id, {
        warehouseId: warehouse.id,
        sellerId,
        name: warehouse.name,
      });

      return warehouse;
    });

    await this.record(actor, 'warehouse.create', created.id, meta, {
      after: created,
    });

    return serializeWarehouse(created);
  }

  async update(
    id: string,
    data: Partial<CreateWarehouseRequest>,
    actor: Actor,
    meta: RequestMeta,
  ): Promise<Warehouse> {
    const existing = await this.prisma.warehouse.findUnique({
      where: { id },
    });
    if (!existing || existing.deletedAt) {
      throw new AppError('WAREHOUSE_NOT_FOUND', 404, { detail: `warehouse ${id} not found` });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.warehouse.updateMany({
          where: { sellerId: existing.sellerId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }

      const warehouse = await tx.warehouse.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.isDefault !== undefined ? { isDefault: data.isDefault } : {}),
          ...(data.address !== undefined ? { address: data.address } : {}),
        },
      });

      await writeInventoryOutbox(tx, 'warehouse', 'warehouse.updated', warehouse.id, {
        warehouseId: warehouse.id,
        sellerId: existing.sellerId,
      });

      return warehouse;
    });

    await this.record(actor, 'warehouse.update', updated.id, meta, {
      before: existing,
      after: updated,
    });

    return serializeWarehouse(updated);
  }

  async remove(id: string, actor: Actor, meta: RequestMeta): Promise<void> {
    const existing = await this.prisma.warehouse.findUnique({
      where: { id },
    });
    if (!existing || existing.deletedAt) {
      throw new AppError('WAREHOUSE_NOT_FOUND', 404, { detail: `warehouse ${id} not found` });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const warehouse = await tx.warehouse.update({
        where: { id },
        data: { deletedAt: new Date(), isDefault: false },
      });

      await writeInventoryOutbox(tx, 'warehouse', 'warehouse.deleted', warehouse.id, {
        warehouseId: warehouse.id,
        sellerId: existing.sellerId,
      });

      return warehouse;
    });

    await this.record(actor, 'warehouse.delete', updated.id, meta, {
      before: existing,
      after: updated,
    });
  }
}
