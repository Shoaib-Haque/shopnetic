/**
 * Maps a catalog API error `code` to a key in the `catalog` message namespace.
 * Never surface the server's own text (plan/CODING-RULES.md section F2).
 */
const CODE_TO_KEY: Record<string, string> = {
  CATEGORY_SLUG_TAKEN: 'errors.categorySlugTaken',
  CATEGORY_NAME_TAKEN: 'errors.categoryNameTaken',
  CATEGORY_PARENT_INVALID: 'errors.categoryParentInvalid',
  CATEGORY_PARENT_ARCHIVED: 'errors.categoryParentArchived',
  CATEGORY_HAS_CHILDREN: 'errors.categoryHasChildren',
  CATEGORY_CYCLE: 'errors.categoryCycle',
  BRAND_SLUG_TAKEN: 'errors.brandSlugTaken',
  BRAND_NAME_TAKEN: 'errors.brandNameTaken',
  CONFLICT: 'errors.conflict',
  VALIDATION_ERROR: 'errors.validation',
  UNAUTHENTICATED: 'errors.unauthenticated',
  FORBIDDEN: 'errors.forbidden',
  // Everything else (500/502/503/404/429/malformed) intentionally falls through
  // to `errors.generic` — one "try again" line. Only a true network failure
  // (the request never reached the server) gets its own copy, because the
  // user's fix is different: check the connection, not retry.
  OFFLINE: 'errors.offline',
};

export function catalogErrorKey(code: string | undefined): string {
  return (code && CODE_TO_KEY[code]) || 'errors.generic';
}
