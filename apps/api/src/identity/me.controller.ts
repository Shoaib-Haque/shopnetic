import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { Actor } from '@shopnetic/auth';
import type { ActorView } from '@shopnetic/contracts';
import { ok } from '../common/envelope.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentActor } from '../auth/current-actor.decorator.js';

/**
 * FLAG (found 2026-09-15, not fixed — out of scope of the bug that surfaced
 * it): `AuthGuard` verifies against the storefront audience only, but
 * `ActorView.plane` can be `'staff'` too, implying `/me` is meant to work
 * for both planes. If a staff caller ever hits this (nothing does today —
 * grepped, no admin-app call site), it 401s the same way `AuditController`
 * did before it was moved to `StaffAuthGuard`. Needs a real decision before
 * fixing: either a guard that accepts either audience, or splitting into a
 * staff-specific `/me`. Not touched here since nothing currently depends on
 * it and it wasn't the reported bug.
 */
@Controller('identity/v1')
@UseGuards(AuthGuard)
export class MeController {
  /** The authenticated actor: its plane, grants, and flattened permissions. */
  @Get('me')
  me(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
  ): { data: { actor: ActorView }; meta: { requestId: string } } {
    return ok(req, { actor: toActorView(actor) });
  }
}

function toActorView(actor: Actor): ActorView {
  const permissions = [...new Set(actor.grants.flatMap((g) => g.permissions))].sort();
  return {
    accountId: actor.accountId,
    plane: actor.plane,
    permissions,
    grants: actor.grants.map((g) => ({
      role: g.role,
      scopeType: g.scopeType,
      scopeId: g.scopeId,
    })),
  };
}
