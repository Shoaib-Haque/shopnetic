/** Clamps a requested page `limit` into `[lo, hi]`, truncating any fraction. */
export function clampLimit(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(Math.trunc(n), lo), hi);
}

/**
 * Slices a keyset-paginated `findMany` result (fetched with `take: limit +
 * 1`) back down to `limit` rows, deriving the next cursor from whether that
 * extra row came back. Shared by every cursor-paginated list endpoint —
 * `brand`/`product` services, `staff-accounts`, `audit` — which all
 * duplicated this exact slice/nextCursor pair.
 */
export function paginate<T extends { id: string }>(
  rows: T[],
  limit: number,
): { page: T[]; nextCursor?: string } {
  const page = rows.slice(0, limit);
  const nextCursor = rows.length > limit ? page.at(-1)?.id : undefined;
  return { page, ...(nextCursor ? { nextCursor } : {}) };
}
