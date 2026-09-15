import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { QueueName, type MailSendJob } from '@shopnetic/events';
import { API_ENV, type ApiEnv } from '../config/env.js';

/**
 * Producer side only — `apps/api` enqueues, `apps/workers` processes
 * (`plan/31-background-jobs-and-queues.md` section 3). A dedicated ioredis
 * connection, not `RedisService`'s: that one's tuned for rate-limit buckets
 * (`maxRetriesPerRequest: 2`), which conflicts with BullMQ's own
 * recommendation for its connections.
 */
@Injectable()
export class MailQueueService implements OnModuleDestroy {
  private readonly connection: Redis;
  private readonly queue: Queue<MailSendJob>;

  constructor(@Inject(API_ENV) env: ApiEnv) {
    this.connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
    this.queue = new Queue<MailSendJob>(QueueName.MAIL, { connection: this.connection });
  }

  /** Fire-and-forget from the caller's point of view — retries/backoff/DLQ
   * are BullMQ's job from here (`plan/31` section 4). Not wrapped in an
   * outbox yet: the documented first-slice shortcut for mail specifically
   * (`plan/31` section 4) — every mail-triggering action here is
   * user-retriggerable, never money. */
  async enqueue(payload: MailSendJob): Promise<void> {
    await this.queue.add('send', payload, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 5000 },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    this.connection.disconnect();
  }
}
