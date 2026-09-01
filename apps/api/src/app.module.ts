import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { HealthController } from './health/health.controller.js';

/**
 * Root module. Bounded-context modules (identity, catalog, orders, …) are
 * registered here as they are built — plan/02-architecture.md,
 * plan/23-project-structure.md.
 */
@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
