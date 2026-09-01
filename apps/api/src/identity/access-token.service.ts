import { Inject, Injectable } from '@nestjs/common';
import type { AuthTokens } from '@shopnetic/contracts';
import { API_ENV, type ApiEnv } from '../config/env.js';
import { JwksService } from '../crypto/jwks.service.js';

/** Audience claims per plane (plan/16 §2). A token is only valid for its plane. */
export const STOREFRONT_AUDIENCE = 'storefront';
export const STAFF_AUDIENCE = 'admin';

@Injectable()
export class AccessTokenService {
  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly jwks: JwksService,
  ) {}

  async issue(
    accountId: string,
    sessionId: string,
    audience: string = STOREFRONT_AUDIENCE,
  ): Promise<AuthTokens> {
    const expiresIn = this.env.JWT_ACCESS_TTL_SECONDS;
    const accessToken = await this.jwks.signAccessToken({
      subject: accountId,
      sessionId,
      audience,
      expiresInSeconds: expiresIn,
    });
    return { accessToken, tokenType: 'Bearer', expiresIn };
  }
}
