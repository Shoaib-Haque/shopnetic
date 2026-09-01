import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { Actor } from '@shopnetic/auth';
import type { ActorView } from '@shopnetic/contracts';
import { ok } from '../common/envelope.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentActor } from '../auth/current-actor.decorator.js';

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
