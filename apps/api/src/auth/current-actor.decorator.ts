import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { Actor } from '@shopnetic/auth';
import { AppError } from '../common/app-error.js';
import { getActor } from './actor-request.js';

/** Injects the `Actor` attached by `AuthGuard`. Throws if the guard didn't run. */
export const CurrentActor = createParamDecorator((_data: unknown, ctx: ExecutionContext): Actor => {
  const actor = getActor(ctx.switchToHttp().getRequest<Request>());
  if (!actor) throw AppError.unauthenticated('UNAUTHENTICATED', 'route is not behind AuthGuard');
  return actor;
});
