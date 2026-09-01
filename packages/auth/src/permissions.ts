/**
 * Permission constants — `resource:verb`. Roles are bundles of these; business
 * code checks permissions, never role strings (plan/03-users-and-rbac.md §2,
 * plan/CODING-RULES.md §I1).
 *
 * STUB — the full list is seeded from here as features land.
 */
export const Permission = {
  CATALOG_BROWSE: 'catalog:browse',
  ORDER_PLACE: 'order:place',
  OFFER_MANAGE: 'offer:manage',
  PRODUCT_APPROVE: 'product:approve',
  REVIEW_MODERATE: 'review:moderate',
  REPORT_RESOLVE: 'report:resolve',
  SELLER_APPROVE: 'seller:approve',
  COMMISSION_CONFIGURE: 'commission:configure',
  STAFF_MANAGE: 'staff:manage',
  AUDITLOG_READ: 'auditlog:read',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

export type ScopeType = 'self' | 'seller' | 'global';

export interface Grant {
  role: string;
  scopeType: ScopeType;
  scopeId: string | null;
}

export interface Actor {
  accountId: string;
  grants: Grant[];
  permissions: Permission[];
}
