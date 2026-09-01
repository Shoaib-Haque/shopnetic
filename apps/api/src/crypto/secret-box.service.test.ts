import { describe, expect, it } from 'vitest';
import type { ApiEnv } from '../config/env.js';
import { SecretBoxService } from './secret-box.service.js';

const devEnv = { NODE_ENV: 'test' } as ApiEnv;
const keyedEnv = {
  NODE_ENV: 'test',
  TOTP_ENC_KEY: Buffer.alloc(32, 7).toString('base64'),
} as ApiEnv;

describe('SecretBoxService', () => {
  it('round-trips a value with the derived dev key', () => {
    const box = new SecretBoxService(devEnv);
    const plaintext = 'JBSWY3DPEHPK3PXP';
    const ct = box.encrypt(plaintext);
    expect(ct.startsWith('v1.')).toBe(true);
    expect(ct).not.toContain(plaintext);
    expect(box.decrypt(ct)).toBe(plaintext);
  });

  it('produces a fresh IV each time (ciphertext differs, plaintext same)', () => {
    const box = new SecretBoxService(devEnv);
    expect(box.encrypt('same')).not.toEqual(box.encrypt('same'));
  });

  it('rejects a tampered ciphertext (GCM auth tag)', () => {
    const box = new SecretBoxService(devEnv);
    const ct = box.encrypt('secret');
    const parts = ct.split('.');
    const flipped = Buffer.from(parts[3]!, 'base64url');
    flipped[0] = (flipped[0] ?? 0) ^ 0xff;
    parts[3] = flipped.toString('base64url');
    expect(() => box.decrypt(parts.join('.'))).toThrow();
  });

  it('cannot decrypt data written under a different key', () => {
    const ct = new SecretBoxService(keyedEnv).encrypt('secret');
    expect(() => new SecretBoxService(devEnv).decrypt(ct)).toThrow();
  });

  it('rejects a malformed key length', () => {
    const badEnv = { NODE_ENV: 'test', TOTP_ENC_KEY: 'c2hvcnQ=' } as ApiEnv;
    expect(() => new SecretBoxService(badEnv)).toThrow(/32 bytes/);
  });
});
