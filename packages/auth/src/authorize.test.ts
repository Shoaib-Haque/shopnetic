import { describe, expect, it } from 'vitest';
import { can, assertCan, AuthorizationError } from './authorize.js';
import { Permission, type Actor, type Grant } from './permissions.js';

const buyerGrant: Grant = {
  role: 'BUYER',
  scopeType: 'self',
  scopeId: null,
  permissions: [Permission.ORDER_PLACE, Permission.CART_MANAGE, Permission.CATALOG_BROWSE],
};

const sellerGrant = (sellerId: string): Grant => ({
  role: 'SELLER',
  scopeType: 'seller',
  scopeId: sellerId,
  permissions: [Permission.OFFER_MANAGE, Permission.INVENTORY_MANAGE],
});

const staffGrant: Grant = {
  role: 'ADMIN',
  scopeType: 'global',
  scopeId: null,
  permissions: [Permission.SELLER_APPROVE, Permission.AUDITLOG_READ],
};

const actor = (accountId: string, grants: Grant[]): Actor => ({
  accountId,
  plane: grants.some((g) => g.scopeType === 'global') ? 'staff' : 'marketplace',
  grants,
});

describe('can()', () => {
  it('denies by default when no grant carries the permission', () => {
    expect(can(actor('a1', [buyerGrant]), Permission.OFFER_MANAGE)).toBe(false);
    expect(can(actor('a1', []), Permission.CATALOG_BROWSE)).toBe(false);
  });

  it('global scope covers any context', () => {
    const su = actor('staff1', [staffGrant]);
    expect(can(su, Permission.SELLER_APPROVE)).toBe(true);
    expect(can(su, Permission.SELLER_APPROVE, { sellerId: 'anything' })).toBe(true);
    expect(can(su, Permission.AUDITLOG_READ, { ownerAccountId: 'someone-else' })).toBe(true);
  });

  it('self scope: allowed with no object, or when the object is the actor', () => {
    const a = actor('a1', [buyerGrant]);
    expect(can(a, Permission.ORDER_PLACE)).toBe(true);
    expect(can(a, Permission.CART_MANAGE, { ownerAccountId: 'a1' })).toBe(true);
    expect(can(a, Permission.CART_MANAGE, { ownerAccountId: 'a2' })).toBe(false);
  });

  it('seller scope: only for the matching sellerId, never without one', () => {
    const a = actor('a1', [sellerGrant('shop-7')]);
    expect(can(a, Permission.OFFER_MANAGE, { sellerId: 'shop-7' })).toBe(true);
    expect(can(a, Permission.OFFER_MANAGE, { sellerId: 'shop-8' })).toBe(false);
    expect(can(a, Permission.OFFER_MANAGE)).toBe(false);
  });

  it('combines grants: a buyer who also has one seller grant', () => {
    const a = actor('a1', [buyerGrant, sellerGrant('shop-7')]);
    expect(can(a, Permission.ORDER_PLACE)).toBe(true);
    expect(can(a, Permission.OFFER_MANAGE, { sellerId: 'shop-7' })).toBe(true);
    expect(can(a, Permission.OFFER_MANAGE, { sellerId: 'shop-9' })).toBe(false);
    expect(can(a, Permission.SELLER_APPROVE)).toBe(false);
  });

  it('property: no permission outside a grant is ever allowed', () => {
    const grants = [buyerGrant, sellerGrant('s1')];
    const held = new Set(grants.flatMap((g) => g.permissions));
    const a = actor('a1', grants);
    for (const p of Object.values(Permission)) {
      if (held.has(p)) continue;
      expect(can(a, p)).toBe(false);
      expect(can(a, p, { sellerId: 's1' })).toBe(false);
      expect(can(a, p, { ownerAccountId: 'a1' })).toBe(false);
    }
  });
});

describe('assertCan()', () => {
  it('throws AuthorizationError carrying the permission when denied', () => {
    try {
      assertCan(actor('a1', [buyerGrant]), Permission.STAFF_MANAGE);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(AuthorizationError);
      expect((err as AuthorizationError).permission).toBe(Permission.STAFF_MANAGE);
    }
  });

  it('returns void when allowed', () => {
    expect(assertCan(actor('staff1', [staffGrant]), Permission.SELLER_APPROVE)).toBeUndefined();
  });
});
