import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { QueueName, type MediaSweepJob } from '@shopnetic/events';
import { API_ENV, type ApiEnv } from '../config/env.js';

/**
 * Producer side for orphaned upload media cleanup (plan/31-background-jobs-and-queues.md).
 * Dedicated ioredis connection with `maxRetriesPerRequest: null` and `lazyConnect: true`.
 * Enqueues one-off sweeps or sets up scheduled sweeps.
 */
@Injectable()
export class MediaCleanupQueueService implements OnModuleDestroy {
  private readonly connection: Redis;
  private readonly queue: Queue<MediaSweepJob>;

  constructor(@Inject(API_ENV) env: ApiEnv) {
    this.connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
    this.queue = new Queue<MediaSweepJob>(QueueName.MEDIA_CLEANUP, { connection: this.connection });
  }

  async enqueueSweep(gracePeriodMs?: number): Promise<void> {
    await this.queue.add('sweep', gracePeriodMs !== undefined ? { gracePeriodMs } : {}, {
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    });
  }

  async scheduleRecurringSweep(everyMs = 3_600_000): Promise<void> {
    await this.queue.upsertJobScheduler(
      'media-orphan-sweep',
      { every: everyMs },
      {
        name: 'sweep',
        opts: {
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 500 },
        },
      },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    this.connection.disconnect();
  }
}
