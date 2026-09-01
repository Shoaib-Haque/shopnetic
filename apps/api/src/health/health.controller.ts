import { Controller, Get, Logger, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { Health } from '@shopnetic/contracts';
import { PrismaService } from '../prisma/prisma.service.js';

const startedAt = Date.now();
const version = process.env['APP_VERSION'] ?? '0.0.0';

function uptimeSeconds(): number {
  return Math.floor((Date.now() - startedAt) / 1000);
}

@Controller()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Liveness — the process is up. No dependency checks (never fail on a slow DB). */
  @Get('healthz')
  healthz(): Health {
    return { status: 'ok', service: 'api', version, uptimeSeconds: uptimeSeconds() };
  }

  /** Readiness — dependencies reachable. 200 when the DB answers, 503 otherwise. */
  @Get('readyz')
  async readyz(@Res({ passthrough: true }) res: Response): Promise<Health> {
    try {
      await this.prisma.ping();
      return { status: 'ok', service: 'api', version, uptimeSeconds: uptimeSeconds() };
    } catch (err: unknown) {
      this.logger.warn(`readiness check failed: ${err instanceof Error ? err.message : 'unknown'}`);
      res.status(503);
      return { status: 'down', service: 'api', version, uptimeSeconds: uptimeSeconds() };
    }
  }
}
