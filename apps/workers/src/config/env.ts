import { z } from 'zod';

/**
 * Workers process environment, parsed once at boot — same discipline as
 * `apps/api/src/config/env.ts` (`plan/CODING-RULES.md` section B4). Only the
 * variables this process actually needs; not the full API env.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Same Redis apps/api's queues talk to — this process is the consumer side
  // (plan/31-background-jobs-and-queues.md section 3).
  REDIS_URL: z.string().url().startsWith('redis').default('redis://localhost:6380'),

  // Outbound email (Mailpit locally) — same values as apps/api's .env.
  SMTP_URL: z.string().startsWith('smtp').default('smtp://localhost:1025'),
  MAIL_FROM: z.string().default('Shopnetic <no-reply@shopnetic.local>'),
});

export type WorkersEnv = z.infer<typeof envSchema>;

export function loadWorkersEnv(source: NodeJS.ProcessEnv = process.env): WorkersEnv {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid workers environment:\n${issues}`);
  }
  return parsed.data;
}
