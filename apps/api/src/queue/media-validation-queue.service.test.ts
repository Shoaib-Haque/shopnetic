import { describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../config/env.js';

const add = vi.fn().mockResolvedValue(undefined);
const close = vi.fn().mockResolvedValue(undefined);
const env = { REDIS_URL: 'redis://localhost:6380' } as ApiEnv;

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({ add, close })),
}));
vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(() => ({ disconnect: vi.fn() })),
}));

const { MediaValidationQueueService } = await import('./media-validation-queue.service.js');
const { Queue } = await import('bullmq');

describe('MediaValidationQueueService', () => {
  it('enqueues a validation job on the media-validation queue', async () => {
    const service = new MediaValidationQueueService(env);

    await service.enqueueValidation({
      mediaAssetId: 'asset_1',
      fileKey: 'product/11111111-1111-1111-1111-111111111111/123-pic.jpg',
      expectedKind: 'image',
    });

    expect(Queue).toHaveBeenCalledWith('media-validation', expect.anything());
    expect(add).toHaveBeenCalledWith(
      'validate',
      {
        mediaAssetId: 'asset_1',
        fileKey: 'product/11111111-1111-1111-1111-111111111111/123-pic.jpg',
        expectedKind: 'image',
      },
      expect.objectContaining({
        attempts: 3,
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 1000 },
      }),
    );
  });

  it('closes the queue and disconnects on module destroy', async () => {
    const service = new MediaValidationQueueService(env);
    await service.onModuleDestroy();
    expect(close).toHaveBeenCalled();
  });
});
