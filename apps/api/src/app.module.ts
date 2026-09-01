import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { ConfigModule } from './config/config.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RedisModule } from './redis/redis.module.js';
import { CryptoModule } from './crypto/crypto.module.js';
import { IdentityModule } from './identity/identity.module.js';
import { HealthController } from './health/health.controller.js';
import { CorrelationMiddleware } from './common/correlation.middleware.js';

/**
 * Root module. Bounded-context modules (identity, catalog, orders, …) are
 * registered here as they are built — plan/02-architecture.md,
 * plan/23-project-structure.md.
 */
@Module({
  imports: [ConfigModule, PrismaModule, RedisModule, CryptoModule, IdentityModule],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}
