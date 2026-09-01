import { describe, expect, it } from 'vitest';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { Permission, type Actor, type Grant } from '@shopnetic/auth';
import { PermissionGuard } from './permission.guard.js';
import { REQUIRE_PERMISSION, type PermissionRequirement } from './require-permission.decorator.js';
import { AppError } from '../common/app-error.js';

class DummyController {}

function contextWith(
  requirement: PermissionRequirement | undefined,
  actor: Actor | undefined,
  reqExtra: Record<string, unknown> = {},
): ExecutionContext {
  const handler = (): void => undefined;
  if (requirement) Reflect.defineMetadata(REQUIRE_PERMISSION, requirement, handler);

  const request = { actor, params: {}, query: {}, body: {}, ...reqExtra };
  // Minimal ExecutionContext stand-in — only the members PermissionGuard touches.
  const mock = {
    getHandler: () => handler,
    getClass: () => DummyController,
    switchToHttp: () => ({ getRequest: () => request }),
  };
  return mock as object as ExecutionContext;
}

const guard = new PermissionGuard(new Reflector());

const staffActor: Actor = {
  accountId: 'staff-1',
  plane: 'staff',
  grants: [
    { role: 'ADMIN', scopeType: 'global', scopeId: null, permissions: [Permission.AUDITLOG_READ] },
  ],
};
const buyerActor: Actor = {
  accountId: 'buyer-1',
  plane: 'marketplace',
  grants: [
    { role: 'BUYER', scopeType: 'self', scopeId: null, permissions: [Permission.ORDER_PLACE] },
  ],
};
const sellerActor = (sellerId: string): Actor => ({
  accountId: 'seller-1',
  plane: 'marketplace',
  grants: [
    {
      role: 'SELLER',
      scopeType: 'seller',
      scopeId: sellerId,
      permissions: [Permission.OFFER_MANAGE],
    } as Grant,
  ],
});

describe('PermissionGuard', () => {
  it('passes a handler with no @RequirePermission', () => {
    expect(guard.canActivate(contextWith(undefined, buyerActor))).toBe(true);
  });

  it('allows an actor that holds the permission', () => {
    const ctx = contextWith({ permission: Permission.AUDITLOG_READ }, staffActor);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('403s an actor that lacks the permission', () => {
    const ctx = contextWith({ permission: Permission.AUDITLOG_READ }, buyerActor);
    expect(() => guard.canActivate(ctx)).toThrowError(
      expect.objectContaining({ code: 'FORBIDDEN', status: 403 }),
    );
  });

  it('401s (fail closed) when AuthGuard did not attach an actor', () => {
    const ctx = contextWith({ permission: Permission.AUDITLOG_READ }, undefined);
    expect(() => guard.canActivate(ctx)).toThrowError(AppError);
  });

  it('applies the scope resolver for object-level checks', () => {
    const requirement: PermissionRequirement = {
      permission: Permission.OFFER_MANAGE,
      scope: (req) => {
        const sellerId = (req.params as { sellerId?: string }).sellerId;
        return sellerId !== undefined ? { sellerId } : {};
      },
    };
    const okCtx = contextWith(requirement, sellerActor('shop-7'), {
      params: { sellerId: 'shop-7' },
    });
    const denyCtx = contextWith(requirement, sellerActor('shop-7'), {
      params: { sellerId: 'shop-9' },
    });
    expect(guard.canActivate(okCtx)).toBe(true);
    expect(() => guard.canActivate(denyCtx)).toThrowError(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });
});
