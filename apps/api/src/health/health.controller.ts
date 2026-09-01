import { Controller, Get } from '@nestjs/common';
import type { Health } from '@shopnetic/contracts';

const startedAt = Date.now();
const version = process.env['APP_VERSION'] ?? '0.0.0';

@Controller()
export class HealthController {
  /** Liveness — process is up. */
  @Get('healthz')
  healthz(): Health {
    return {
      status: 'ok',
      service: 'api',
      version,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    };
  }

  /**
   * Readiness — dependencies reachable. STUB: returns ok until DB / Redis / broker
   * checks are wired (plan/18-observability.md §10).
   */
  @Get('readyz')
  readyz(): Health {
    return {
      status: 'ok',
      service: 'api',
      version,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    };
  }
}
