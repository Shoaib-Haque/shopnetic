/**
 * Multi-keyword list search (admin-wide).
 *
 * The query is split on whitespace into tokens; each token is matched as a
 * case-insensitive substring against the candidate text. Matching is **OR** — a
 * row is a hit if it contains *any* token — and `matchScore` returns how many
 * distinct tokens matched so callers can rank fuller matches first.
 *
 * Both sides are normalized the same way: lower-cased, apostrophes/quotes
 * dropped (so `mens` matches `Men's`), every other non-alphanumeric run turned
 * into a single space. Tokens shorter than 2 chars are ignored; at most 10 are
 * kept.
 */

const MAX_TOKENS = 10;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’"`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function tokenize(query: string): string[] {
  if (!query) return [];
  const seen = new Set<string>();
  for (const raw of normalize(query).split(' ')) {
    if (raw.length >= 2) seen.add(raw);
    if (seen.size >= MAX_TOKENS) break;
  }
  return [...seen];
}

/** Count of distinct `tokens` found in `text` (0 = no match). */
export function matchScore(text: string, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const hay = normalize(text);
  let score = 0;
  for (const tk of tokens) if (hay.includes(tk)) score += 1;
  return score;
}
