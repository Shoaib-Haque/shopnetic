/**
 * Maps an identity-API error `code` to a message key **within the `auth`
 * namespace** (used with `useTranslations('auth')`). Never show the server's own
 * text (plan/CODING-RULES.md section F2); keys, not English (section L1). Unknown codes fall
 * back to a generic message.
 */
const CODE_TO_KEY: Record<string, string> = {
  INVALID_CREDENTIALS: 'errors.invalidCredentials',
  EMAIL_NOT_VERIFIED: 'errors.emailNotVerified',
  VERIFICATION_TOKEN_INVALID: 'errors.verificationInvalid',
  VERIFICATION_TOKEN_EXPIRED: 'errors.verificationExpired',
  PASSWORD_BREACHED: 'errors.passwordBreached',
  RATE_LIMITED: 'errors.rateLimited',
  VALIDATION_ERROR: 'errors.validation',
  ACCOUNT_LOCKED: 'errors.accountLocked',
};

export function authErrorKey(code: string | undefined): string {
  return (code && CODE_TO_KEY[code]) || 'errors.generic';
}

export function extractErrorCode(body: unknown): string | undefined {
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as { error?: { code?: unknown } }).error;
    if (err && typeof err.code === 'string') return err.code;
  }
  return undefined;
}
