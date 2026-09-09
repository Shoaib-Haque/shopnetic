import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { ApiError } from '@shopnetic/contracts';
import type { ApiEnv } from '../config/env.js';
import { ERROR_BASE, codeForStatus, titleFor } from './all-exceptions.filter.js';

// Only statuses the frontend has a distinct branch for are worth injecting.
const FAULTABLE = new Set([400, 401, 403, 404, 409, 422, 429, 500, 502, 503]);

function routeMatches(path: string, routes: string): boolean {
  const prefixes = routes
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  return prefixes.length === 0 || prefixes.some((p) => path.startsWith(p));
}

function envelope(status: number): ApiError {
  const code = codeForStatus(status);
  const requestId = `req_dev-fault_${randomUUID()}`;
  return {
    error: {
      type: `${ERROR_BASE}${code.toLowerCase()}`,
      title: titleFor(status),
      status,
      code,
      requestId,
      correlationId: requestId,
      detail: 'Synthetic fault injected by DEV_FAULT_STATUS / x-debug-fault.',
    },
  };
}

/**
 * DEV ONLY — short-circuits matching requests with a synthetic error response
 * so every frontend error state can be exercised on demand. Only ever wired in
 * main.ts when `NODE_ENV === 'development'` (plan/CODING-RULES.md section R4) —
 * this file has no effect outside that branch. A per-request
 * `x-debug-fault: <status>` header overrides the configured default;
 * `x-debug-fault: off` forces a real response. Runs after `devResponseDelay`,
 * so `DEV_RESPONSE_DELAY_MS` + a fault composes into slow-then-fail.
 */
export function devFaultInject(
  env: Pick<ApiEnv, 'DEV_FAULT_STATUS' | 'DEV_FAULT_ROUTES' | 'DEV_FAULT_BODY'>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!routeMatches(req.path, env.DEV_FAULT_ROUTES)) {
      next();
      return;
    }

    const header = req.header('x-debug-fault');
    let status = env.DEV_FAULT_STATUS;
    if (header !== undefined) {
      const h = header.trim().toLowerCase();
      if (h === 'off' || h === '0') {
        next();
        return;
      }
      const parsed = Number.parseInt(h, 10);
      if (Number.isFinite(parsed)) status = parsed;
    }

    if (!FAULTABLE.has(status)) {
      next();
      return;
    }

    if (env.DEV_FAULT_BODY === 'empty') {
      res.status(status).end();
      return;
    }
    if (env.DEV_FAULT_BODY === 'malformed') {
      // deliberately truncated JSON — the client's `res.json()` parse throws
      res.status(status).type('application/json').send('{"error":{"code":');
      return;
    }
    res.status(status).json(envelope(status));
  };
}
