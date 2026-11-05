import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { QueueName, type MediaValidationJob } from '@shopnetic/events';
import { API_ENV, type ApiEnv } from '../config/env.js';

/**
 * Producer side for async media validation on S3 uploads (plan/31-background-jobs-and-queues.md).
 * Dedicated ioredis connection with `maxRetriesPerRequest: null` and `lazyConnect: true`.
 * Enqueues validation jobs after a media asset row is recorded with an internal S3 storage key.
 */
@Injectable()
export class MediaValidationQueueService implements OnModuleDestroy {
  private readonly connection: Redis;
  private readonly queue: Queue<MediaValidationJob>;

  constructor(@Inject(API_ENV) env: ApiEnv) {
    this.connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
    this.queue = new Queue<MediaValidationJob>(QueueName.MEDIA_VALIDATION, {
      connection: this.connection,
    });
  }

  async enqueueValidation(job: MediaValidationJob): Promise<void> {
    await this.queue.add('validate', job, {
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
