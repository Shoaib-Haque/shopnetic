import { describe, expect, it } from 'vitest';
import { createLocalJWKSet, decodeJwt, jwtVerify } from 'jose';
import type { ApiEnv } from '../config/env.js';
import { JwksService } from './jwks.service.js';

const env = {
  NODE_ENV: 'test',
  JWT_ISSUER: 'https://shopnetic.test',
  JWT_ACCESS_TTL_SECONDS: 900,
} as ApiEnv;

async function makeService(): Promise<JwksService> {
  const svc = new JwksService(env);
  await svc.onModuleInit();
  return svc;
}

describe('JwksService', () => {
  it('publishes exactly one RS256 signing key with a kid', async () => {
    const svc = await makeService();
    const { keys } = svc.jwks();
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatchObject({ kty: 'RSA', alg: 'RS256', use: 'sig' });
    expect(keys[0]?.kid).toBeTruthy();
    expect(keys[0]?.d).toBeUndefined(); // private component not exposed
  });

  it('mints an access token that verifies against the published JWKS', async () => {
    const svc = await makeService();
    const token = await svc.signAccessToken({
      subject: 'acc_123',
      sessionId: 'sess_456',
      audience: 'storefront',
      expiresInSeconds: 900,
    });

    const jwks = createLocalJWKSet(svc.jwks());
    const { payload, protectedHeader } = await jwtVerify(token, jwks, {
      issuer: 'https://shopnetic.test',
      audience: 'storefront',
    });

    expect(protectedHeader.alg).toBe('RS256');
    expect(protectedHeader.kid).toBe(svc.jwks().keys[0]?.kid);
    expect(payload.sub).toBe('acc_123');
    expect(payload.sid).toBe('sess_456');
    expect(payload.exp! - payload.iat!).toBe(900);
  });

  it('is rejected by a JWKS from a different keypair', async () => {
    const signer = await makeService();
    const other = await makeService();
    const token = await signer.signAccessToken({
      subject: 's',
      sessionId: 'x',
      audience: 'storefront',
      expiresInSeconds: 60,
    });
    await expect(jwtVerify(token, createLocalJWKSet(other.jwks()))).rejects.toThrow();
    expect(decodeJwt(token).sub).toBe('s'); // still a well-formed JWT
  });
});
