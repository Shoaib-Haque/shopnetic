import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { SellerService } from './seller.service.js';
import { AdminSellerController, PublicShopController } from './seller.controller.js';
import { SellerPortalController } from './seller-portal.controller.js';

@Module({
  imports: [PrismaModule, AuditModule, AuthModule],
  controllers: [AdminSellerController, PublicShopController, SellerPortalController],
  providers: [SellerService],
  exports: [SellerService],
})
export class SellerModule {}
