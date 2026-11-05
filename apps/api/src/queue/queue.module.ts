import { Global, Module } from '@nestjs/common';
import { MailQueueService } from './mail-queue.service.js';
import { MediaCleanupQueueService } from './media-cleanup-queue.service.js';
import { MediaValidationQueueService } from './media-validation-queue.service.js';
import { ImageVariantQueueService } from './image-variant-queue.service.js';

/** Global — every context that needs to enqueue a job depends on this
 * (mirrors `RedisModule`'s shape; plan/31 section 3). */
@Global()
@Module({
  providers: [
    MailQueueService,
    MediaCleanupQueueService,
    MediaValidationQueueService,
    ImageVariantQueueService,
  ],
  exports: [
    MailQueueService,
    MediaCleanupQueueService,
    MediaValidationQueueService,
    ImageVariantQueueService,
  ],
})
export class QueueModule {}
