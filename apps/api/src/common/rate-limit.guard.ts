import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { RedisService } from '../redis/redis.service.js';
import { API_ENV, rateLimitDisabled, type ApiEnv } from '../config/env.js';
import { AppError } from './app-error.js';
import { RATE_LIMIT_KEY, type RateLimitRule } from './rate-limit.decorator.js';

/**
 * Per-IP fixed-window limiter for routes tagged with `@RateLimit`. Sets
 * `X-RateLimit-*` headers; a breach throws `RATE_LIMITED` (429 + `Retry-After`).
 * If Redis is unavailable the request is allowed through (fail-open) and the
 * error surfaces via the Redis client's own logging. `DEV_RATE_LIMIT_DISABLED`
 * (development only) turns the whole guard off.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (rateLimitDisabled(this.env)) return true;

    const rule = this.reflector.getAllAndOverride<RateLimitRule | undefined>(RATE_LIMIT_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!rule) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const ip = clientIp(req);
    const key = `rl:${rule.name}:${ip}`;

    let count = 0;
    let resetIn = rule.windowSeconds;
    try {
      const hit = await this.redis.hitFixedWindow(key, rule.windowSeconds);
      count = hit.count;
      resetIn = hit.resetIn;
    } catch {
      return true; // fail-open on limiter infrastructure failure
    }

    const remaining = Math.max(0, rule.limit - count);
    res.setHeader('X-RateLimit-Limit', String(rule.limit));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(resetIn));

    if (count > rule.limit) throw AppError.rateLimited(resetIn);
    return true;
  }
}

function clientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0]!.trim();
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
