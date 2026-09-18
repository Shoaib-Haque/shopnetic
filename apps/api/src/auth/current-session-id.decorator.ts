import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AppError } from '../common/app-error.js';
import { getSessionId } from './actor-request.js';

/** Injects the session id `StaffAuthGuard` attached from the access token's
 * `sid` claim. Throws if the guard didn't run (mirrors `@CurrentActor()`). */
export const CurrentSessionId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const sessionId = getSessionId(ctx.switchToHttp().getRequest<Request>());
    if (!sessionId)
      throw AppError.unauthenticated('UNAUTHENTICATED', 'route is not behind AuthGuard');
    return sessionId;
  },
);
