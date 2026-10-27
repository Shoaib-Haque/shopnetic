import 'server-only';
import { z } from 'zod';

const schema = z.object({
  API_BASE_URL: z.string().url().default('http://localhost:4000'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3001'),
});

export const serverEnv = schema.parse(process.env);
export const isProd = serverEnv.NODE_ENV === 'production';
