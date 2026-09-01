import { SetMetadata } from '@nestjs/common';

export interface RateLimitRule {
  /** Bucket name, combined with the client IP. */
  name: string;
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMIT_KEY = 'shopnetic:rate-limit';

/** Attach a per-IP fixed-window limit to a route handler (plan/16 §5). */
export const RateLimit = (rule: RateLimitRule): MethodDecorator =>
  SetMetadata(RATE_LIMIT_KEY, rule);
