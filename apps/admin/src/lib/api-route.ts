import { NextResponse } from 'next/server';
import type { ZodType } from 'zod';

/**
 * Every `/api/staff-auth/*` BFF route that accepts a body does the same
 * "parse or 422" dance before touching the identity API. A malformed/
 * non-JSON body (`req.json()` throwing) collapses into the same
 * `VALIDATION_ERROR` a schema mismatch would give — the caller never needs
 * to tell the two apart.
 */
export async function parseJsonBody<T>(
  req: Request,
  schema: ZodType<T>,
): Promise<{ data: T } | { error: NextResponse }> {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return { error: NextResponse.json({ error: { code: 'VALIDATION_ERROR' } }, { status: 422 }) };
  }
  return { data: parsed.data };
}
