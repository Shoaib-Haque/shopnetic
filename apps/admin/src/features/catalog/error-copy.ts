/**
 * Maps a catalog API error `code` to a key in the `catalog` message namespace.
 * Never surface the server's own text (plan/CODING-RULES.md §F2).
 */
const CODE_TO_KEY: Record<string, string> = {
  CATEGORY_SLUG_TAKEN: 'errors.categorySlugTaken',
  CATEGORY_PARENT_INVALID: 'errors.categoryParentInvalid',
  CATEGORY_HAS_CHILDREN: 'errors.categoryHasChildren',
  CATEGORY_CYCLE: 'errors.categoryCycle',
  VALIDATION_ERROR: 'errors.validation',
  UNAUTHENTICATED: 'errors.unauthenticated',
  FORBIDDEN: 'errors.forbidden',
};

export function catalogErrorKey(code: string | undefined): string {
  return (code && CODE_TO_KEY[code]) || 'errors.generic';
}
