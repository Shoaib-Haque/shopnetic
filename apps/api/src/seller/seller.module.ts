import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { SellerService } from './seller.service.js';
import { AdminSellerController, PublicShopController } from './seller.controller.js';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [AdminSellerController, PublicShopController],
  providers: [SellerService],
  exports: [SellerService],
})
export class SellerModule {}
