import type { Request } from 'express';

/** Wraps a handler result in the standard success envelope (plan/08 section 4).
 * `extraMeta` merges in extra `meta` fields (e.g. a paginated list's `count`/
 * `nextCursor`) — added so `category.controller.ts`'s and `audit.controller.ts`'s
 * paginated-list endpoints don't each need their own private copy of the
 * `x-request-id` header-unwrap this function already does. */
export function ok<T, E extends Record<string, unknown> = Record<string, never>>(
  req: Request,
  data: T,
  extraMeta?: E,
): { data: T; meta: { requestId: string } & E } {
  const rid = req.headers['x-request-id'];
  const requestId = (Array.isArray(rid) ? rid[0] : rid) ?? 'unknown';
  return { data, meta: { requestId, ...(extraMeta ?? ({} as E)) } };
}
