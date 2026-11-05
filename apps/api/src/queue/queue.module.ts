import { Global, Module } from '@nestjs/common';
import { MailQueueService } from './mail-queue.service.js';
import { MediaCleanupQueueService } from './media-cleanup-queue.service.js';
import { MediaValidationQueueService } from './media-validation-queue.service.js';

/** Global — every context that needs to enqueue a job depends on this
 * (mirrors `RedisModule`'s shape; plan/31 section 3). */
@Global()
@Module({
  providers: [MailQueueService, MediaCleanupQueueService, MediaValidationQueueService],
  exports: [MailQueueService, MediaCleanupQueueService, MediaValidationQueueService],
})
export class QueueModule {}
