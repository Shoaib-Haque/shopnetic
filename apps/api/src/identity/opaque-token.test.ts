import { describe, expect, it } from 'vitest';
import { generateOpaqueToken, hashOpaqueToken } from './opaque-token.js';

describe('opaque tokens', () => {
  it('generates unique, url-safe, high-entropy tokens', () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();
    expect(a).not.toEqual(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThanOrEqual(42); // 32 bytes base64url
  });

  it('hashes deterministically and irreversibly (sha-256 hex)', () => {
    const token = generateOpaqueToken();
    expect(hashOpaqueToken(token)).toEqual(hashOpaqueToken(token));
    expect(hashOpaqueToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashOpaqueToken(token)).not.toContain(token);
  });
});
