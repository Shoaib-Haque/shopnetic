import { createHash, randomBytes } from 'node:crypto';

/**
 * Opaque secret tokens (refresh tokens, email-verification tokens). The raw
 * value goes to the client exactly once; only its SHA-256 is stored, so a DB
 * leak doesn't yield usable tokens (plan/16 section 1).
 */
export function generateOpaqueToken(byteLength = 32): string {
  return randomBytes(byteLength).toString('base64url');
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
