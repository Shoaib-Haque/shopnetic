import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@shopnetic/db';

/**
 * The one Prisma client for the process, wired into Nest's lifecycle. Feature
 * services inject `PrismaService` and use it as the client.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({ log: ['warn', 'error'] });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('database connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Cheap round-trip for readiness checks. Throws if the DB is unreachable. */
  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }
}
