import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  importPKCS8,
  importSPKI,
  jwtVerify,
  calculateJwkThumbprint,
  type JWK,
  type JWTVerifyGetKey,
  type KeyLike,
} from 'jose';
import { API_ENV, type ApiEnv } from '../config/env.js';

const ALG = 'RS256';

interface SignInput {
  subject: string;
  sessionId: string;
  audience: string;
  /** seconds */
  expiresInSeconds: number;
  extraClaims?: Record<string, unknown>;
}

/**
 * Holds the RS256 signing key and publishes the public half as a JWKS
 * (plan/16 section 1). In non-production, if no key is configured, an ephemeral pair is
 * generated at boot — tokens then don't survive a restart, which is fine for dev.
 */
@Injectable()
export class JwksService implements OnModuleInit {
  private readonly logger = new Logger(JwksService.name);
  private privateKey!: KeyLike;
  private publicJwk!: JWK;
  private kid!: string;
  private keySet!: JWTVerifyGetKey;

  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  async onModuleInit(): Promise<void> {
    if (this.env.JWT_PRIVATE_KEY && this.env.JWT_PUBLIC_KEY) {
      this.privateKey = await importPKCS8(this.env.JWT_PRIVATE_KEY, ALG);
      const pub = await importSPKI(this.env.JWT_PUBLIC_KEY, ALG);
      this.publicJwk = await exportJWK(pub);
    } else {
      if (this.env.NODE_ENV === 'production') {
        throw new Error('JWT_PRIVATE_KEY / JWT_PUBLIC_KEY are required in production');
      }
      const { privateKey, publicKey } = await generateKeyPair(ALG, { extractable: true });
      this.privateKey = privateKey;
      this.publicJwk = await exportJWK(publicKey);
      this.logger.warn('no JWT key configured — using an ephemeral dev keypair');
    }

    this.kid = await calculateJwkThumbprint(this.publicJwk);
    this.publicJwk = { ...this.publicJwk, kid: this.kid, alg: ALG, use: 'sig' };
    this.keySet = createLocalJWKSet({ keys: [this.publicJwk] });
  }

  jwks(): { keys: JWK[] } {
    return { keys: [this.publicJwk] };
  }

  /**
   * Verify an access token against the local public key. Throws (any jose
   * error) on a bad signature, wrong issuer/audience, or expiry.
   */
  async verifyAccessToken(
    token: string,
    audience: string,
  ): Promise<{ accountId: string; sessionId: string }> {
    const { payload } = await jwtVerify(token, this.keySet, {
      issuer: this.env.JWT_ISSUER,
      audience,
      algorithms: [ALG],
    });
    const accountId = payload.sub;
    const sessionId = payload['sid'];
    if (typeof accountId !== 'string' || typeof sessionId !== 'string') {
      throw new Error('access token missing sub/sid');
    }
    return { accountId, sessionId };
  }

  async signAccessToken(input: SignInput): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ sid: input.sessionId, ...input.extraClaims })
      .setProtectedHeader({ alg: ALG, kid: this.kid, typ: 'JWT' })
      .setIssuer(this.env.JWT_ISSUER)
      .setAudience(input.audience)
      .setSubject(input.subject)
      .setIssuedAt(now)
      .setExpirationTime(now + input.expiresInSeconds)
      .sign(this.privateKey);
  }
}
