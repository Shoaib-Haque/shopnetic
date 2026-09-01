/**
 * Stable machine-readable error codes. The server returns one of these + params;
 * the client renders the localized message via `t(\`errors.${code}\`, params)`
 * (plan/24-i18n-localization.md §4). Never return a human sentence as the
 * primary error.
 *
 * STUB — extended as endpoints are built.
 */
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
