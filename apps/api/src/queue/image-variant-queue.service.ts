import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { QueueName, type ImageVariantJob } from '@shopnetic/events';
import { API_ENV, type ApiEnv } from '../config/env.js';

/**
 * Producer side for async image variant generation (plan/26, plan/31-background-jobs-and-queues.md).
 * Dedicated ioredis connection with `maxRetriesPerRequest: null` and `lazyConnect: true`.
 * Enqueues image-variant jobs when an image media asset is created or replaced.
 */
@Injectable()
export class ImageVariantQueueService implements OnModuleDestroy {
  private readonly connection: Redis;
  private readonly queue: Queue<ImageVariantJob>;

  constructor(@Inject(API_ENV) env: ApiEnv) {
    this.connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
    this.queue = new Queue<ImageVariantJob>(QueueName.IMAGE_VARIANTS, {
      connection: this.connection,
    });
  }

  async enqueueImageVariants(job: ImageVariantJob): Promise<void> {
    await this.queue.add('generate', job, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 1000 },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    this.connection.disconnect();
  }
}
