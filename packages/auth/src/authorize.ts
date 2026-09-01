import type { Actor, Permission } from './permissions.js';

export interface ResourceContext {
  sellerId?: string;
  ownerAccountId?: string;
}

/**
 * The single authorization entry point. Business code calls this — never
 * `if (actor.role === 'ADMIN')` (plan/03 §2, plan/CODING-RULES.md §I1).
 *
 * STUB: real implementation (permission check + object-level scope check,
 * deny-by-default) lands with Identity & Access in Phase 0.
 */
export function can(_actor: Actor, _permission: Permission, _ctx: ResourceContext = {}): boolean {
  throw new Error('NOT_IMPLEMENTED: authorize.can — see plan/03-users-and-rbac.md');
}
