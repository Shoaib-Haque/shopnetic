import 'server-only';
import { z } from 'zod';

/** Server-only env, parsed once (plan/CODING-RULES.md section B4/section I3). Never import from a client component. */
const schema = z.object({
  API_BASE_URL: z.string().url().default('http://localhost:4000'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  ADMIN_BASE_PATH: z.string().default('x7f2k9t3m1qp'),
});

export const serverEnv = schema.parse(process.env);
export const isProd = serverEnv.NODE_ENV === 'production';
