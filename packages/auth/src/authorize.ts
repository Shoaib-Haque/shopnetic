import type { Actor, Grant, Permission } from './permissions.js';

export interface ResourceContext {
  /** Seller that owns the resource — matched against a `seller`-scoped grant. */
  sellerId?: string;
  /** Account that owns the resource — matched against a `self`-scoped grant. */
  ownerAccountId?: string;
}

/**
 * The single authorization entry point (plan/03 §2, plan/CODING-RULES.md §I1).
 * **Deny by default.** True only when the actor holds a grant that (a) carries
 * `permission` and (b) whose scope covers `ctx`:
 *
 *  - `global` — covers everything (staff).
 *  - `self`   — covers an action with no specific object, or one whose
 *               `ownerAccountId` is the actor.
 *  - `seller` — covers an action whose `sellerId` equals the grant's `scopeId`.
 *
 * Business code still does its own object-level ownership check where the
 * resource isn't identified purely by these ids.
 */
export function can(actor: Actor, permission: Permission, ctx: ResourceContext = {}): boolean {
  return actor.grants.some((grant) => grantAllows(grant, permission, ctx, actor.accountId));
}

/** Throwing form for guards/services. */
export function assertCan(actor: Actor, permission: Permission, ctx: ResourceContext = {}): void {
  if (!can(actor, permission, ctx)) {
    throw new AuthorizationError(permission);
  }
}

export class AuthorizationError extends Error {
  readonly permission: Permission;
  constructor(permission: Permission) {
    super(`not authorized: ${permission}`);
    this.name = 'AuthorizationError';
    this.permission = permission;
  }
}

function grantAllows(
  grant: Grant,
  permission: Permission,
  ctx: ResourceContext,
  actorAccountId: string,
): boolean {
  if (!grant.permissions.includes(permission)) return false;

  switch (grant.scopeType) {
    case 'global':
      return true;
    case 'self':
      return ctx.ownerAccountId === undefined || ctx.ownerAccountId === actorAccountId;
    case 'seller':
      return ctx.sellerId !== undefined && ctx.sellerId === grant.scopeId;
    default:
      return false;
  }
}
