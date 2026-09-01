import { z } from 'zod';

/** Shape returned by `GET /healthz` and `/readyz` on every service. */
export const healthSchema = z.object({
  status: z.enum(['ok', 'degraded', 'down']),
  service: z.string(),
  version: z.string(),
  uptimeSeconds: z.number().nonnegative(),
});
export type Health = z.infer<typeof healthSchema>;
