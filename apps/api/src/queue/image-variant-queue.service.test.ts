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

const { ImageVariantQueueService } = await import('./image-variant-queue.service.js');
const { Queue } = await import('bullmq');

describe('ImageVariantQueueService', () => {
  it('enqueues a variant job on the image-variants queue', async () => {
    const service = new ImageVariantQueueService(env);

    await service.enqueueImageVariants({
      mediaAssetId: 'asset_1',
      fileKey: 'product/11111111-1111-1111-1111-111111111111/123-pic.jpg',
    });

    expect(Queue).toHaveBeenCalledWith('image-variants', expect.anything());
    expect(add).toHaveBeenCalledWith(
      'generate',
      {
        mediaAssetId: 'asset_1',
        fileKey: 'product/11111111-1111-1111-1111-111111111111/123-pic.jpg',
      },
      expect.objectContaining({
        attempts: 3,
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 1000 },
      }),
    );
  });

  it('closes the queue and disconnects on module destroy', async () => {
    const service = new ImageVariantQueueService(env);
    await service.onModuleDestroy();
    expect(close).toHaveBeenCalled();
  });
});
