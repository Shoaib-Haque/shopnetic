import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AppError } from '../common/app-error.js';
import { JwksService } from '../crypto/jwks.service.js';
import { ActorService } from '../identity/actor.service.js';
import { STAFF_AUDIENCE } from '../identity/access-token.service.js';
import { setActor } from './actor-request.js';

/**
 * Like `AuthGuard` but for the staff plane: the token must carry `aud=admin`
 * **and** the account must be on the `staff` plane. A storefront token can never
 * satisfy this (plan/03 §1).
 */
@Injectable()
export class StaffAuthGuard implements CanActivate {
  constructor(
    private readonly jwks: JwksService,
    private readonly actors: ActorService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw AppError.unauthenticated('UNAUTHENTICATED', 'missing bearer token');

    let accountId: string;
    try {
      ({ accountId } = await this.jwks.verifyAccessToken(token, STAFF_AUDIENCE));
    } catch {
      throw AppError.unauthenticated('UNAUTHENTICATED', 'invalid or expired admin token');
    }

    const actor = await this.actors.forAccount(accountId);
    if (!actor) throw AppError.unauthenticated('UNAUTHENTICATED', 'account unavailable');
    if (actor.plane !== 'staff') {
      throw AppError.forbidden('STAFF_PLANE_REQUIRED', 'not a staff account');
    }

    setActor(req, actor);
    return true;
  }
}
