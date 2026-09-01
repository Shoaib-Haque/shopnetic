import type { Actor, Permission } from './permissions.js';

export interface ResourceContext {
  /** Seller that owns the resource — checked against a `seller`-scoped grant. */
  sellerId?: string;
  /** Account that owns the resource — checked against a `self`-scoped grant. */
  ownerAccountId?: string;
}

/**
 * The single authorization entry point. Business code calls this — never
 * `if (actor.role === 'ADMIN')` (plan/03 §2, plan/CODING-RULES.md §I1).
 *
 * STUB: the real deny-by-default check (permission match + object-level scope
 * match) lands with the Nest guard + `@RequirePermission` decorator in the
 * "RBAC enforcement" Phase 0 slice. The `Actor` / `Grant` shape it will consume
 * is already fixed in `./permissions.ts`.
 */
export function can(_actor: Actor, _permission: Permission, _ctx: ResourceContext = {}): boolean {
  throw new Error('NOT_IMPLEMENTED: authorize.can — RBAC enforcement slice (plan/03).');
}
