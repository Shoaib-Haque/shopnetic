import { PrismaClient } from '@prisma/client';

/**
 * Prisma client singleton (plan/01-tech-stack.md, plan/25 section 3.6).
 *
 * One instance per process. In dev the instance is stashed on `globalThis` so a
 * watch-mode reload does not open a new pool each time. In prod the connection
 * string points at PgBouncer (transaction pooling); pool caps are per service.
 */
const globalForPrisma = globalThis as typeof globalThis & { __shopneticPrisma?: PrismaClient };

export function getPrismaClient(): PrismaClient {
  if (globalForPrisma.__shopneticPrisma) return globalForPrisma.__shopneticPrisma;

  const client = new PrismaClient({ log: ['warn', 'error'] });

  if (process.env['NODE_ENV'] !== 'production') {
    globalForPrisma.__shopneticPrisma = client;
  }
  return client;
}

export { PrismaClient };
export type { Prisma } from '@prisma/client';
