import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { OfferService } from './offer.service.js';
import { StockService } from './stock.service.js';
import { WarehouseService } from './warehouse.service.js';
import { BuyboxService } from './buybox.service.js';
import {
  AdminOfferController,
  AdminWarehouseController,
  PublicCatalogOfferController,
} from './inventory.controller.js';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [AdminOfferController, AdminWarehouseController, PublicCatalogOfferController],
  providers: [OfferService, StockService, WarehouseService, BuyboxService],
  exports: [OfferService, StockService, WarehouseService, BuyboxService],
})
export class InventoryModule {}
