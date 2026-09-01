import type { Request } from 'express';

/** Wraps a handler result in the standard success envelope (plan/08 §4). */
export function ok<T>(req: Request, data: T): { data: T; meta: { requestId: string } } {
  const rid = req.headers['x-request-id'];
  return { data, meta: { requestId: (Array.isArray(rid) ? rid[0] : rid) ?? 'unknown' } };
}
