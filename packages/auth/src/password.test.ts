import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword, needsRehash, ARGON2_OPTIONS } from './password.js';

describe('password hashing', () => {
  it('verifies a correct password and rejects a wrong one', async () => {
    const encoded = await hashPassword('correct horse battery staple');
    expect(encoded).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(encoded, 'correct horse battery staple')).toBe(true);
    expect(await verifyPassword(encoded, 'Correct Horse Battery Staple')).toBe(false);
  });

  it('produces a different hash each time (random salt)', async () => {
    const a = await hashPassword('same-input');
    const b = await hashPassword('same-input');
    expect(a).not.toEqual(b);
  });

  it('returns false for a malformed hash instead of throwing', async () => {
    await expect(verifyPassword('not-a-hash', 'x')).resolves.toBe(false);
  });

  it('flags hashes weaker than the current params for rehash', async () => {
    const current = await hashPassword('x');
    expect(needsRehash(current)).toBe(false);

    const weak = `$argon2id$v=19$m=${ARGON2_OPTIONS.memoryCost - 1024},t=1,p=1$` + 'c2FsdA$aGFzaA';
    expect(needsRehash(weak)).toBe(true);
    expect(needsRehash('garbage')).toBe(true);
  });
});
