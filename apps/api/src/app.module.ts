import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller.js';

/**
 * Root module. Bounded-context modules (identity, catalog, orders, …) are
 * registered here as they are built — plan/02-architecture.md,
 * plan/23-project-structure.md.
 */
@Module({
  imports: [],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
