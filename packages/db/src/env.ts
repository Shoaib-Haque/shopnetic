import { z } from 'zod';

/**
 * Database environment. Parsed once, at the edge (plan/CODING-RULES.md section B4).
 * `DIRECT_URL` is the un-pooled connection Prisma Migrate needs; it falls back
 * to `DATABASE_URL` for local dev where there is no PgBouncer.
 */
const dbEnvSchema = z.object({
  DATABASE_URL: z.string().url().startsWith('postgres'),
  DIRECT_URL: z.string().url().startsWith('postgres').optional(),
});

export type DbEnv = z.infer<typeof dbEnvSchema>;

let cached: DbEnv | undefined;

export function loadDbEnv(source: NodeJS.ProcessEnv = process.env): DbEnv {
  if (cached) return cached;
  const parsed = dbEnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid database environment:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
