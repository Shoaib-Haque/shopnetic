import { hash, verify } from '@node-rs/argon2';

/**
 * Password hashing — argon2id, per plan/16-security.md §1.
 *
 * `@node-rs/argon2` defaults to the argon2id variant; we pin the cost params
 * (OWASP baseline: 19 MiB memory, t=2, p=1). Params are carried in the encoded
 * hash string, so raising them later lets `needsRehash` trigger a transparent
 * re-hash on next login.
 */
export const ARGON2_OPTIONS = {
  memoryCost: 19_456, // KiB (19 MiB)
  timeCost: 2,
  parallelism: 1,
} as const;

/** Recorded on the `credential` row for observability / future migrations. */
export const ARGON2_PARAMS = {
  algo: 'argon2id',
  memoryCostKib: ARGON2_OPTIONS.memoryCost,
  timeCost: ARGON2_OPTIONS.timeCost,
  parallelism: ARGON2_OPTIONS.parallelism,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTIONS);
}

/** Constant-time verify. Returns false on a malformed hash rather than throwing. */
export async function verifyPassword(encodedHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(encodedHash, plain, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}

/**
 * True when `encodedHash` was produced with weaker params than we now require —
 * caller should re-hash the plaintext it just verified and store the result.
 */
export function needsRehash(encodedHash: string): boolean {
  const m = /\$argon2id\$v=\d+\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(encodedHash);
  if (!m) return true;
  const [, mem, t, p] = m;
  return (
    Number(mem) < ARGON2_OPTIONS.memoryCost ||
    Number(t) < ARGON2_OPTIONS.timeCost ||
    Number(p) < ARGON2_OPTIONS.parallelism
  );
}
