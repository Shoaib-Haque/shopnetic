import { describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../config/env.js';

const add = vi.fn().mockResolvedValue(undefined);
const upsertJobScheduler = vi.fn().mockResolvedValue(undefined);
const close = vi.fn().mockResolvedValue(undefined);
const env = { REDIS_URL: 'redis://localhost:6380' } as ApiEnv;

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({ add, upsertJobScheduler, close })),
}));
vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(() => ({ disconnect: vi.fn() })),
}));

const { MediaCleanupQueueService } = await import('./media-cleanup-queue.service.js');
const { Queue } = await import('bullmq');

describe('MediaCleanupQueueService', () => {
  it('enqueues a sweep job on the media-cleanup queue', async () => {
    const service = new MediaCleanupQueueService(env);

    await service.enqueueSweep(1800000);

    expect(Queue).toHaveBeenCalledWith('media-cleanup', expect.anything());
    expect(add).toHaveBeenCalledWith(
      'sweep',
      { gracePeriodMs: 1800000 },
      expect.objectContaining({
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      }),
    );
  });

  it('schedules a recurring sweep with repeat options', async () => {
    const service = new MediaCleanupQueueService(env);

    await service.scheduleRecurringSweep(3600000);

    expect(upsertJobScheduler).toHaveBeenCalledWith(
      'media-orphan-sweep',
      { every: 3600000 },
      expect.objectContaining({
        name: 'sweep',
      }),
    );
  });

  it('closes the queue and disconnects on module destroy', async () => {
    const service = new MediaCleanupQueueService(env);
    await service.onModuleDestroy();
    expect(close).toHaveBeenCalled();
  });
});
