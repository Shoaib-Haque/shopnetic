import { describe, expect, it } from 'vitest';
import { Permission, PERMISSIONS, Role, SYSTEM_ROLES, ROLE_PERMISSIONS } from './permissions.js';

const known = new Set<string>(PERMISSIONS);

describe('permission catalog', () => {
  it('has a unique, non-empty key for every permission', () => {
    const keys = Object.values(Permission);
    expect(keys.length).toBeGreaterThan(0);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(/^[a-z]+(\.[a-z]+)?:[a-z]+$/);
  });

  it('every role maps only to permissions that exist, with no duplicates', () => {
    for (const role of SYSTEM_ROLES) {
      const perms = ROLE_PERMISSIONS[role];
      expect(perms.length).toBeGreaterThan(0);
      expect(new Set(perms).size).toBe(perms.length);
      for (const p of perms) expect(known.has(p)).toBe(true);
    }
  });

  it('privilege tiers are strictly nested: SERVICE_ADMIN ⊆ ADMIN ⊆ SUPER_ADMIN', () => {
    const admin = new Set(ROLE_PERMISSIONS[Role.ADMIN]);
    const superAdmin = new Set(ROLE_PERMISSIONS[Role.SUPER_ADMIN]);
    for (const p of ROLE_PERMISSIONS[Role.SERVICE_ADMIN]) expect(admin.has(p)).toBe(true);
    for (const p of ROLE_PERMISSIONS[Role.ADMIN]) expect(superAdmin.has(p)).toBe(true);
  });

  it('only SUPER_ADMIN can manage staff and define roles', () => {
    for (const role of SYSTEM_ROLES) {
      const canManageStaff = ROLE_PERMISSIONS[role].includes(Permission.STAFF_MANAGE);
      expect(canManageStaff).toBe(role === Role.SUPER_ADMIN);
    }
  });

  it('buyer cannot fulfil orders or approve products', () => {
    const buyer = ROLE_PERMISSIONS[Role.BUYER];
    expect(buyer).not.toContain(Permission.SELLER_ORDER_FULFIL);
    expect(buyer).not.toContain(Permission.PRODUCT_APPROVE);
  });
});
