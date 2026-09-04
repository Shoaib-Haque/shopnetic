import { z } from 'zod';

/**
 * API process environment, parsed once at boot (plan/CODING-RULES.md section B4).
 * A missing/invalid var fails startup loudly instead of surfacing later.
 */
const pemKey = z
  .string()
  .min(1)
  .transform((s) => s.replace(/\\n/g, '\n'));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(4000),
  APP_VERSION: z.string().default('0.0.0'),

  DATABASE_URL: z.string().url().startsWith('postgres'),
  REDIS_URL: z.string().url().startsWith('redis').default('redis://localhost:6380'),

  // Access-token signing (RS256). Omit both in dev for an ephemeral keypair.
  JWT_ISSUER: z.string().url().default('https://shopnetic.local'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().max(3600).default(900),
  JWT_PRIVATE_KEY: pemKey.optional(),
  JWT_PUBLIC_KEY: pemKey.optional(),

  // Refresh sessions + email verification.
  AUTH_REFRESH_TTL_DAYS: z.coerce.number().int().positive().max(400).default(30),
  AUTH_STAFF_REFRESH_TTL_HOURS: z.coerce.number().int().positive().max(72).default(8),
  VERIFICATION_TTL_HOURS: z.coerce.number().int().positive().max(168).default(24),

  // Staff TOTP: AES-256-GCM key for the stored seed (32 bytes, base64). Dev may omit.
  TOTP_ENC_KEY: z.string().optional(),
  TOTP_ISSUER: z.string().default('Shopnetic'),
  // Accept a code from ±N 30s steps (clock skew tolerance). 1 = RFC default.
  TOTP_WINDOW_STEPS: z.coerce.number().int().min(0).max(20).default(1),

  // Outbound email (Mailpit locally).
  SMTP_URL: z.string().startsWith('smtp').default('smtp://localhost:1025'),
  MAIL_FROM: z.string().default('Shopnetic <no-reply@shopnetic.local>'),

  // Where email links point.
  APP_WEB_URL: z.string().url().default('http://localhost:3000'),
  ADMIN_WEB_URL: z.string().url().default('http://localhost:3002'),
  ADMIN_BASE_PATH: z.string().default('x7f2k9t3m1qp'),

  // Have I Been Pwned k-anonymity check on new passwords.
  PASSWORD_BREACH_CHECK: z
    .enum(['true', 'false', '1', '0'])
    .default('false')
    .transform((v) => v === 'true' || v === '1'),

  // DEV ONLY: skip TOTP for staff login and skip the email-verified gate for
  // buyer login. Never active in `test` (CI always runs the real flow); a boot
  // check rejects it in `production`. Password, tokens and RBAC are unchanged.
  DEV_AUTH_RELAXED: z
    .enum(['true', 'false', '1', '0'])
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
  // DEV ONLY — turn off every `@RateLimit` guard so local testing isn't throttled.
  DEV_RATE_LIMIT_DISABLED: z
    .enum(['true', 'false', '1', '0'])
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
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
  if (parsed.data.NODE_ENV === 'production' && parsed.data.DEV_AUTH_RELAXED) {
    throw new Error('DEV_AUTH_RELAXED must not be set in production');
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.DEV_RATE_LIMIT_DISABLED) {
    throw new Error('DEV_RATE_LIMIT_DISABLED must not be set in production');
  }
  return parsed.data;
}

/** True only in `development` with the flag on — MFA / email-verify gates skipped. */
export function authRelaxed(env: Pick<ApiEnv, 'NODE_ENV' | 'DEV_AUTH_RELAXED'>): boolean {
  return env.NODE_ENV === 'development' && env.DEV_AUTH_RELAXED;
}

/** True only in `development` with the flag on — every `@RateLimit` guard is skipped. */
export function rateLimitDisabled(
  env: Pick<ApiEnv, 'NODE_ENV' | 'DEV_RATE_LIMIT_DISABLED'>,
): boolean {
  return env.NODE_ENV === 'development' && env.DEV_RATE_LIMIT_DISABLED;
}
