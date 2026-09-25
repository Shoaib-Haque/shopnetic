/**
 * Multi-token, relevance-ranked `LIKE` search over raw SQL — the one shared
 * copy behind every admin list search (Category, Brand, Staff, Audit Log,
 * and any future one — Products/Media when they land). Previously
 * duplicated near-verbatim in each service (each with its own "mirrors
 * CategoryService's own tokenizeForSql" comment); only `CategoryService`
 * actually ranked results by how well they matched — the others matched on
 * "any token" but ordered by `id`, so a query like "fx 47" against "FX Live
 * Brand 47" (2 tokens match) could land anywhere among every other
 * "FX..." row instead of at the top. Found live, generalized here so it's
 * one decision, not four.
 */

/** Mirrors `apps/admin/src/lib/search.ts`'s `tokenize()` — same normalize
 * (lower-case, apostrophes dropped, everything else non-alphanumeric
 * collapsed to a space) and the same ≥2-char / ≤10-token rules — so a query
 * matches the same rows server-side that it would have matched client-side. */
export function tokenizeForSql(query: string): string[] {
  const normalized = query
    .toLowerCase()
    .replace(/['’"`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const tokens = new Set<string>();
  for (const tok of normalized.split(' ')) {
    if (tok.length >= 2) tokens.add(tok);
    if (tokens.size >= 10) break;
  }
  return [...tokens];
}

/**
 * Builds a `WHERE` fragment (any token matches) and a match-count `score`
 * expression (how many tokens matched) against `haystackSql` — a SQL
 * expression evaluating to the lowercased, searchable text for one row
 * (e.g. `lower(name || ' ' || slug)`). `ORDER BY <scoreSql> DESC` then puts
 * a row matching every token above one matching only some.
 *
 * Appends its own placeholders to the caller's positional-params array —
 * call this *after* pushing any other `WHERE` params that come earlier in
 * the same query, so `$N` numbering lines up.
 */
export function buildTokenSearch(
  tokens: string[],
  haystackSql: string,
  params: unknown[],
): { whereSql: string; scoreSql: string } {
  const matchExprs = tokens.map((tok) => {
    params.push(`%${tok}%`);
    return `(${haystackSql} LIKE $${params.length})`;
  });
  return {
    whereSql: `(${matchExprs.join(' OR ')})`,
    scoreSql: matchExprs.map((e) => `${e}::int`).join(' + '),
  };
}

/**
 * A score-ranked query's cursor can't be the usual keyset `id` bound — score
 * isn't monotonic with `id`, so "everything after this id" no longer means
 * "the next page of this ordering". An offset (stringified) takes its
 * place, same trade-off `CategoryService.list`'s own search mode already
 * made. Use these two only on the branch where `tokens.length > 0`; the
 * non-search branch keeps its normal keyset cursor untouched.
 */
export function rankedOffsetFromCursor(cursor: string | undefined): number {
  return cursor ? Math.max(0, Math.trunc(Number(cursor)) || 0) : 0;
}

export function rankedNextCursor(
  rowCount: number,
  take: number,
  offset: number,
): string | undefined {
  return rowCount > take ? String(offset + take) : undefined;
}
