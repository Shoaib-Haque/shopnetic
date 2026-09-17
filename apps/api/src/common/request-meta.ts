import type { Request } from 'express';

/**
 * Pulls the request metadata carried into audit rows out of an incoming
 * request — IP, correlation id, and (for the staff-auth flows that want it
 * for their own audit trail detail) user agent. Every catalog controller
 * and `staff.controller.ts` had its own byte-identical copy of this
 * (`meta(req)` / `ctxOf(req)`); structurally a superset of
 * `identity.service.ts`'s `RequestMeta` (`ip?`, `correlationId?`) is fine to
 * pass anywhere that type is expected — the extra `userAgent` field is
 * simply ignored by callers that don't ask for it.
 */
export function requestMeta(req: Request): {
  ip?: string;
  userAgent?: string;
  correlationId?: string;
} {
  const ua = req.headers['user-agent'];
  const cid = req.headers['x-correlation-id'];
  return {
    ...(req.ip ? { ip: req.ip } : {}),
    ...(typeof ua === 'string' ? { userAgent: ua } : {}),
    ...(typeof cid === 'string' ? { correlationId: cid } : {}),
  };
}
