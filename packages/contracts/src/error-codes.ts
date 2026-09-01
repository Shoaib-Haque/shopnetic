/**
 * Stable machine-readable error codes. The server returns one of these + params;
 * the client renders the localized message via `t(\`errors.${code}\`, params)`
 * (plan/24-i18n-localization.md §4). Never return a human sentence as the
 * primary error.
 *
 * Extended as endpoints are built. Keys are stable once shipped.
 */
export const ErrorCode = {
  // Generic / transport
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',

  // Auth / identity
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  VERIFICATION_TOKEN_INVALID: 'VERIFICATION_TOKEN_INVALID',
  VERIFICATION_TOKEN_EXPIRED: 'VERIFICATION_TOKEN_EXPIRED',
  REFRESH_TOKEN_INVALID: 'REFRESH_TOKEN_INVALID',
  SESSION_REVOKED: 'SESSION_REVOKED',
  PASSWORD_BREACHED: 'PASSWORD_BREACHED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',

  // Staff plane
  MFA_REQUIRED: 'MFA_REQUIRED',
  MFA_INVALID: 'MFA_INVALID',
  MFA_ALREADY_ENROLLED: 'MFA_ALREADY_ENROLLED',
  STAFF_PLANE_REQUIRED: 'STAFF_PLANE_REQUIRED',
  INVITE_INVALID: 'INVITE_INVALID',
  INVITE_EXPIRED: 'INVITE_EXPIRED',
  INVITE_EMAIL_TAKEN: 'INVITE_EMAIL_TAKEN',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
