/**
 * Prisma client singleton — see plan/01-tech-stack.md and
 * plan/25-database-conventions.md §3.6.
 *
 * STUB: the schema has no models yet, so there is no generated client. Once
 * Identity & Access models land we will:
 *   1. add models to prisma/schema.prisma (grouped by context, `@@schema(...)`)
 *   2. `pnpm --filter @shopnetic/db exec prisma generate`
 *   3. replace this with the real singleton (global-cached in dev, pooled via
 *      PgBouncer in prod).
 */

export function getPrismaClient(): never {
  throw new Error(
    'NOT_IMPLEMENTED: @shopnetic/db — add Prisma models + `prisma generate` first (Phase 0).',
  );
}

export const DATABASE_SCHEMAS = ['identity', 'catalog', 'inventory', 'orders', 'payments'] as const;
