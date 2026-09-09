import type { NextFunction, Request, Response } from 'express';
import type { ApiEnv } from '../config/env.js';

const MAX_HEADER_DELAY_MS = 60_000;

function routeMatches(path: string, routes: string): boolean {
  const prefixes = routes
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  return prefixes.length === 0 || prefixes.some((p) => path.startsWith(p));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * DEV ONLY — artificially delays matching responses so loading states can be
 * eyeballed under realistic latency instead of localhost's ~1ms round trip.
 * Only ever wired in main.ts when `NODE_ENV === 'development'`
 * (plan/CODING-RULES.md section R / H8-adjacent dev-flag convention) — this
 * file has no effect outside that branch, so there's no prod code path here.
 * A per-request `x-debug-delay: <ms>` header overrides the configured
 * default so a single tab/request can be slowed without restarting the
 * server or affecting other open tabs.
 */
export function devResponseDelay(
  env: Pick<ApiEnv, 'DEV_RESPONSE_DELAY_MS' | 'DEV_RESPONSE_DELAY_ROUTES'>,
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!routeMatches(req.path, env.DEV_RESPONSE_DELAY_ROUTES)) {
      next();
      return;
    }
    const header = req.header('x-debug-delay');
    const override = header !== undefined ? Number.parseInt(header, 10) : NaN;
    const ms = Number.isFinite(override)
      ? Math.min(Math.max(override, 0), MAX_HEADER_DELAY_MS)
      : env.DEV_RESPONSE_DELAY_MS;
    if (ms <= 0) {
      next();
      return;
    }
    sleep(ms).then(next);
  };
}
