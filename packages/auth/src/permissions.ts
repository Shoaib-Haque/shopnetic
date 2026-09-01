/**
 * Permission + role model — plan/03-users-and-rbac.md §2–4, plan/CODING-RULES.md §I1.
 *
 * Business code checks *permissions*, never role strings. Roles are just named
 * bundles of permissions, seeded into the `identity.role` / `identity.permission`
 * tables from the constants in this file.
 *
 * This list grows as features land; keys are stable once shipped (they are
 * persisted and referenced by grants).
 */

export const Permission = {
  // Storefront / everyone
  CATALOG_BROWSE: 'catalog:browse',

  // Buyer (scope: self)
  ORDER_PLACE: 'order:place',
  REVIEW_WRITE: 'review:write',
  CART_MANAGE: 'cart:manage',
  PROFILE_MANAGE: 'profile:manage',
  ADDRESS_MANAGE: 'address:manage',

  // Seller (scope: seller:{id})
  OFFER_MANAGE: 'offer:manage',
  INVENTORY_MANAGE: 'inventory:manage',
  SHOP_MANAGE: 'shop:manage',
  SELLER_ORDER_FULFIL: 'seller.order:fulfil',
  COUPON_SELLER_MANAGE: 'coupon.seller:manage',
  SELLER_ANALYTICS_READ: 'seller.analytics:read',

  // Trust & safety (staff, scope: global)
  REVIEW_MODERATE: 'review:moderate',
  REPORT_RESOLVE: 'report:resolve',
  DISPUTE_WORK: 'dispute:work',
  DISPUTE_REFUND: 'dispute:refund',
  CONTENT_MODERATE: 'content:moderate',

  // Catalog governance (staff)
  PRODUCT_APPROVE: 'product:approve',
  CATEGORY_MANAGE: 'category:manage',
  BRAND_MANAGE: 'brand:manage',
  ATTRIBUTE_MANAGE: 'attribute:manage',

  // Operations (admin)
  BUYER_MANAGE: 'buyer:manage',
  SELLER_APPROVE: 'seller:approve',
  ORDER_MANAGE: 'order:manage',
  COUPON_PLATFORM_MANAGE: 'coupon.platform:manage',
  CMS_MANAGE: 'cms:manage',
  REPORT_READ: 'report:read',

  // Platform owner (super admin)
  COMMISSION_CONFIGURE: 'commission:configure',
  STAFF_MANAGE: 'staff:manage',
  ROLE_DEFINE: 'role:define',
  FEATUREFLAG_TOGGLE: 'featureflag:toggle',
  CONFIG_MANAGE: 'config:manage',
  AUDITLOG_READ: 'auditlog:read',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

/** Every permission key, for seeding `identity.permission`. */
export const PERMISSIONS: readonly Permission[] = Object.values(Permission);

/**
 * System roles. `is_system = true` in the DB — a Super Admin can add *custom*
 * staff roles later (plan/03 §2) but cannot delete these.
 */
export const Role = {
  BUYER: 'BUYER',
  SELLER: 'SELLER',
  SERVICE_ADMIN: 'SERVICE_ADMIN',
  ADMIN: 'ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export const SYSTEM_ROLES: readonly Role[] = Object.values(Role);

/** Roles that only exist on the staff plane (invite-only, `aud=admin`). */
export const STAFF_ROLES: readonly Role[] = [Role.SERVICE_ADMIN, Role.ADMIN, Role.SUPER_ADMIN];

export function isStaffRole(role: string): role is Role {
  return (STAFF_ROLES as readonly string[]).includes(role);
}

const P = Permission;

const BUYER_PERMS: Permission[] = [
  P.CATALOG_BROWSE,
  P.ORDER_PLACE,
  P.REVIEW_WRITE,
  P.CART_MANAGE,
  P.PROFILE_MANAGE,
  P.ADDRESS_MANAGE,
];

const SELLER_PERMS: Permission[] = [
  P.CATALOG_BROWSE,
  P.OFFER_MANAGE,
  P.INVENTORY_MANAGE,
  P.SHOP_MANAGE,
  P.SELLER_ORDER_FULFIL,
  P.COUPON_SELLER_MANAGE,
  P.SELLER_ANALYTICS_READ,
];

const SERVICE_ADMIN_PERMS: Permission[] = [
  P.CATALOG_BROWSE,
  P.REVIEW_MODERATE,
  P.REPORT_RESOLVE,
  P.DISPUTE_WORK,
  P.DISPUTE_REFUND, // refund cap is enforced in code, not by a separate permission
  P.CONTENT_MODERATE,
  P.AUDITLOG_READ, // partial in practice; scoped down in the read query
];

const ADMIN_PERMS: Permission[] = [
  ...SERVICE_ADMIN_PERMS,
  P.PRODUCT_APPROVE,
  P.CATEGORY_MANAGE,
  P.BRAND_MANAGE,
  P.ATTRIBUTE_MANAGE,
  P.BUYER_MANAGE,
  P.SELLER_APPROVE,
  P.ORDER_MANAGE,
  P.COUPON_PLATFORM_MANAGE,
  P.COUPON_SELLER_MANAGE,
  P.CMS_MANAGE,
  P.REPORT_READ,
];

const SUPER_ADMIN_PERMS: Permission[] = [
  ...ADMIN_PERMS,
  P.COMMISSION_CONFIGURE,
  P.STAFF_MANAGE,
  P.ROLE_DEFINE,
  P.FEATUREFLAG_TOGGLE,
  P.CONFIG_MANAGE,
];

/** Role → permission keys. De-duplicated; used by the DB seed. */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.BUYER]: dedupe(BUYER_PERMS),
  [Role.SELLER]: dedupe(SELLER_PERMS),
  [Role.SERVICE_ADMIN]: dedupe(SERVICE_ADMIN_PERMS),
  [Role.ADMIN]: dedupe(ADMIN_PERMS),
  [Role.SUPER_ADMIN]: dedupe(SUPER_ADMIN_PERMS),
};

function dedupe(perms: Permission[]): Permission[] {
  return [...new Set(perms)];
}

/**
 * A single authority record on an account: this role, over this data boundary.
 * `permissions` is resolved from `role_permission` when the access token is
 * minted, so the authorization check never touches the DB.
 */
export type ScopeType = 'self' | 'seller' | 'global';

export interface Grant {
  role: string;
  scopeType: ScopeType;
  /** sellerId for `seller` scope; `null` for `self` / `global`. */
  scopeId: string | null;
  permissions: Permission[];
}

/** Two account planes that never cross (plan/03 §1). */
export type AccountPlane = 'marketplace' | 'staff';

export interface Actor {
  accountId: string;
  plane: AccountPlane;
  grants: Grant[];
}
