import { z } from 'zod';

/**
 * API process environment, parsed once at boot (plan/CODING-RULES.md §B4).
 * A missing/invalid var fails startup loudly instead of surfacing later.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(4000),
  DATABASE_URL: z.string().url().startsWith('postgres'),
  APP_VERSION: z.string().default('0.0.0'),
});

export type ApiEnv = z.infer<typeof envSchema>;

export const API_ENV = Symbol('API_ENV');

export function loadApiEnv(source: NodeJS.ProcessEnv = process.env): ApiEnv {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid API environment:\n${issues}`);
  }
  return parsed.data;
}
