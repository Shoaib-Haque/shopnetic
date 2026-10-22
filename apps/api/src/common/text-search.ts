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

export interface BuildTokenSearchOptions {
  /**
   * Optional primary text expression (e.g. `lower(coalesce(title_i18n->>'en', ''))` or `lower(name)`).
   * Matches in this primary field receive higher relevance weight than matches in secondary fields (e.g. slug/code/id).
   */
  primarySql?: string;
}

/**
 * Builds a `WHERE` fragment (any token matches) and a relevance-weighted `score`
 * expression against `haystackSql` (and optionally `opts.primarySql`).
 *
 * Scoring tiers:
 * 1. Base: Each token match in `haystackSql` (+1 point each).
 * 2. All-tokens bonus: If >1 token and all tokens match (+5 points).
 * 3. Full phrase in haystack: If >1 token and full consecutive phrase matches (+10 points).
 * 4. Primary field (if provided):
 *    - Token match in primary field: (+2 points each).
 *    - Full phrase in primary field: (+10 points).
 *    - Prefix match (primary field starts with phrase): (+10 points).
 *    - Exact match (primary field equals phrase): (+20 points).
 *
 * Appends its own placeholders to the caller's positional-params array —
 * call this *after* pushing any other `WHERE` params that come earlier in
 * the same query, so `$N` numbering lines up.
 */
export function buildTokenSearch(
  tokens: string[],
  haystackSql: string,
  params: unknown[],
  opts?: BuildTokenSearchOptions,
): { whereSql: string; scoreSql: string } {
  if (tokens.length === 0) {
    return { whereSql: '1=1', scoreSql: '0' };
  }

  const tokenParamIndexes: number[] = [];
  const matchExprs = tokens.map((tok) => {
    params.push(`%${tok}%`);
    tokenParamIndexes.push(params.length);
    return `(${haystackSql} LIKE $${params.length})`;
  });

  const scoreParts: string[] = [];

  // A. Base: per-token match in haystack (1 point each)
  scoreParts.push(...matchExprs.map((e) => `${e}::int`));

  const fullPhrase = tokens.join(' ');
  let phraseParamIndex: number | undefined;

  // B. Multi-token combinations
  if (tokens.length > 1) {
    // All tokens match bonus
    scoreParts.push(`((${matchExprs.join(' AND ')})::int * 5)`);

    // Full consecutive phrase in haystack
    params.push(`%${fullPhrase}%`);
    phraseParamIndex = params.length;
    scoreParts.push(`((${haystackSql} LIKE $${phraseParamIndex})::int * 10)`);
  }

  // C. Primary field boosts
  if (opts?.primarySql) {
    const pSql = opts.primarySql;

    // Per-token match in primary field (+2 points each)
    tokens.forEach((_, idx) => {
      const pIdx = tokenParamIndexes[idx]!;
      scoreParts.push(`((${pSql} LIKE $${pIdx})::int * 2)`);
    });

    if (tokens.length > 1 && phraseParamIndex !== undefined) {
      // Full phrase in primary field (+10 points, reuses phrase param)
      scoreParts.push(`((${pSql} LIKE $${phraseParamIndex})::int * 10)`);
    }

    // Prefix match (+10 points)
    params.push(`${fullPhrase}%`);
    scoreParts.push(`((${pSql} LIKE $${params.length})::int * 10)`);

    // Exact match (+20 points)
    params.push(fullPhrase);
    scoreParts.push(`((${pSql} = $${params.length})::int * 20)`);
  }

  return {
    whereSql: `(${matchExprs.join(' OR ')})`,
    scoreSql: scoreParts.join(' + '),
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
