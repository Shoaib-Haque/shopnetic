export { getPrismaClient, PrismaClient } from './client.js';
export { Prisma } from '@prisma/client';
export { loadDbEnv, type DbEnv } from './env.js';

/**
 * Model + enum types generated from `prisma/schema.prisma`. Consumers import
 * these from here rather than depending on `@prisma/client` directly.
 */
export type {
  Account,
  Credential,
  EmailVerification,
  Session,
  TotpSecret,
  RecoveryCode,
  Role,
  Permission,
  RolePermission,
  Grant,
  StaffInvite,
  AuditEvent,
  Outbox,
  Category,
  Brand,
  BrandAlias,
  OptionType,
  OptionValue,
  CatalogOutbox,
} from '@prisma/client';

export {
  AccountPlane,
  AccountStatus,
  EmailVerificationPurpose,
  SessionRevokedReason,
  GrantScopeType,
  CategoryBrandRequirement,
  BrandStatus,
  OptionDataType,
  OptionTypeStatus,
  OptionValueStatus,
} from '@prisma/client';

/**
 * Postgres schemas currently created by migrations. Grows one entry per bounded
 * context as its models land (plan/07). Planned full set: identity, catalog,
 * inventory, orders, payments, seller, cart, promo, …
 */
export const DATABASE_SCHEMAS = ['identity', 'catalog'] as const;
