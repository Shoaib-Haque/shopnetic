/**
 * Maps an identity-API error `code` to a key within the `staff` message
 * namespace. Never surface the server's own text (plan/CODING-RULES.md §F2).
 */
const CODE_TO_KEY: Record<string, string> = {
  INVALID_CREDENTIALS: 'errors.invalidCredentials',
  MFA_REQUIRED: 'errors.mfaRequired',
  MFA_INVALID: 'errors.mfaInvalid',
  MFA_ALREADY_ENROLLED: 'errors.mfaAlreadyEnrolled',
  ACCOUNT_LOCKED: 'errors.accountLocked',
  RATE_LIMITED: 'errors.rateLimited',
  VALIDATION_ERROR: 'errors.validation',
  INVITE_INVALID: 'errors.inviteInvalid',
  INVITE_EXPIRED: 'errors.inviteExpired',
  INVITE_EMAIL_TAKEN: 'errors.inviteEmailTaken',
  PASSWORD_BREACHED: 'errors.passwordBreached',
};

export function staffErrorKey(code: string | undefined): string {
  return (code && CODE_TO_KEY[code]) || 'errors.generic';
}

export function extractErrorCode(body: unknown): string | undefined {
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as { error?: { code?: unknown } }).error;
    if (err && typeof err.code === 'string') return err.code;
  }
  return undefined;
}
