import 'server-only';

export interface StaffTokens {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
}

/** Pull `data.tokens` out of a staff login / totp-confirm / refresh response. */
export function readTokens(body: unknown): StaffTokens | null {
  const tokens = (body as { data?: { tokens?: Partial<StaffTokens> } } | null)?.data?.tokens;
  if (!tokens || typeof tokens.accessToken !== 'string' || typeof tokens.expiresIn !== 'number') {
    return null;
  }
  return {
    accessToken: tokens.accessToken,
    tokenType: tokens.tokenType ?? 'Bearer',
    expiresIn: tokens.expiresIn,
  };
}
