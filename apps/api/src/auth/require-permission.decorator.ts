import { SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { Permission, ResourceContext } from '@shopnetic/auth';

/** Pulls `{ sellerId?, ownerAccountId? }` from the request for the scope check. */
export type ScopeResolver = (req: Request) => ResourceContext;

export interface PermissionRequirement {
  permission: Permission;
  scope?: ScopeResolver;
}

export const REQUIRE_PERMISSION = 'shopnetic:require-permission';

/**
 * Gate a handler on a permission (plan/CODING-RULES.md §I1). Optionally pass a
 * scope resolver so `PermissionGuard` can do the object-level check too.
 * Requires `AuthGuard` earlier in the chain.
 */
export const RequirePermission = (permission: Permission, scope?: ScopeResolver): MethodDecorator =>
  SetMetadata(
    REQUIRE_PERMISSION,
    (scope ? { permission, scope } : { permission }) satisfies PermissionRequirement,
  );
