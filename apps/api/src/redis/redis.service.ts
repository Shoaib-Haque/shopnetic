import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Redis } from 'ioredis';
import { API_ENV, type ApiEnv } from '../config/env.js';

/**
 * Thin wrapper over a single ioredis connection. Used for rate-limit buckets now
 * (plan/08 section 8); cache read-models and the session denylist later.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(@Inject(API_ENV) env: ApiEnv) {
    this.client = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 2 });
    this.client.on('error', (err: Error) => this.logger.warn(`redis error: ${err.message}`));
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect();
    this.logger.log('redis connected');
  }

  async onModuleDestroy(): Promise<void> {
    this.client.disconnect();
  }

  /**
   * Fixed-window counter. Returns the count after this hit and the seconds left
   * in the window. First hit sets the TTL.
   */
  async hitFixedWindow(
    key: string,
    windowSeconds: number,
  ): Promise<{ count: number; resetIn: number }> {
    const count = await this.client.incr(key);
    if (count === 1) {
      await this.client.expire(key, windowSeconds);
      return { count, resetIn: windowSeconds };
    }
    const ttl = await this.client.ttl(key);
    return { count, resetIn: ttl < 0 ? windowSeconds : ttl };
  }
}
