import { Inject, Injectable } from '@nestjs/common';
import type { AuthTokens } from '@shopnetic/contracts';
import { API_ENV, type ApiEnv } from '../config/env.js';
import { JwksService } from '../crypto/jwks.service.js';

/** Audience claim for storefront (marketplace-plane) access tokens (plan/16 §2). */
export const STOREFRONT_AUDIENCE = 'storefront';

@Injectable()
export class AccessTokenService {
  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly jwks: JwksService,
  ) {}

  async issue(accountId: string, sessionId: string): Promise<AuthTokens> {
    const expiresIn = this.env.JWT_ACCESS_TTL_SECONDS;
    const accessToken = await this.jwks.signAccessToken({
      subject: accountId,
      sessionId,
      audience: STOREFRONT_AUDIENCE,
      expiresInSeconds: expiresIn,
    });
    return { accessToken, tokenType: 'Bearer', expiresIn };
  }
}
