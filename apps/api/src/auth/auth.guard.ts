import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AppError } from '../common/app-error.js';
import { JwksService } from '../crypto/jwks.service.js';
import { ActorService } from '../identity/actor.service.js';
import { STOREFRONT_AUDIENCE } from '../identity/access-token.service.js';
import { setActor } from './actor-request.js';

/**
 * Requires a valid `Authorization: Bearer <access-jwt>`. Verifies the signature
 * + issuer + audience, loads the `Actor` (grants → permissions), attaches it to
 * the request. Any failure → `401 UNAUTHENTICATED` (plan/16 §2).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwks: JwksService,
    private readonly actors: ActorService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) {
      throw AppError.unauthenticated('UNAUTHENTICATED', 'missing bearer token');
    }

    let accountId: string;
    try {
      ({ accountId } = await this.jwks.verifyAccessToken(token, STOREFRONT_AUDIENCE));
    } catch {
      throw AppError.unauthenticated('UNAUTHENTICATED', 'invalid or expired access token');
    }

    const actor = await this.actors.forAccount(accountId);
    if (!actor) {
      throw AppError.unauthenticated('UNAUTHENTICATED', 'account unavailable');
    }

    setActor(req, actor);
    return true;
  }
}
