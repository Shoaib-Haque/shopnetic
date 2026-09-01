import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { can } from '@shopnetic/auth';
import { AppError } from '../common/app-error.js';
import { getActor } from './actor-request.js';
import { REQUIRE_PERMISSION, type PermissionRequirement } from './require-permission.decorator.js';

/**
 * Enforces `@RequirePermission`. Reads the actor set by `AuthGuard`, resolves
 * the resource context, and calls `can()`. Missing permission → `403 FORBIDDEN`.
 * A handler with no `@RequirePermission` passes straight through.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const requirement = this.reflector.getAllAndOverride<PermissionRequirement | undefined>(
      REQUIRE_PERMISSION,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!requirement) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const actor = getActor(req);
    if (!actor) {
      // AuthGuard should have run first; fail closed.
      throw AppError.unauthenticated('UNAUTHENTICATED', 'no actor on request');
    }

    const resourceCtx = requirement.scope ? requirement.scope(req) : {};
    if (!can(actor, requirement.permission, resourceCtx)) {
      throw AppError.forbidden('FORBIDDEN', `missing permission: ${requirement.permission}`);
    }
    return true;
  }
}
