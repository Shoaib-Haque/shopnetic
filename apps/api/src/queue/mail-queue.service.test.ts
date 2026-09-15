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

const { MailQueueService } = await import('./mail-queue.service.js');
const { Queue } = await import('bullmq');

describe('MailQueueService', () => {
  it('enqueues a "send" job on the mail queue with retry/backoff and a cap on kept jobs', async () => {
    const service = new MailQueueService(env);

    await service.enqueue({ to: 'a@b.com', subject: 'Hi', text: 'Body' });

    expect(Queue).toHaveBeenCalledWith('mail', expect.anything());
    expect(add).toHaveBeenCalledWith(
      'send',
      { to: 'a@b.com', subject: 'Hi', text: 'Body' },
      expect.objectContaining({
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
      }),
    );
  });

  it('closes the queue and disconnects on module destroy', async () => {
    const service = new MailQueueService(env);
    await service.onModuleDestroy();
    expect(close).toHaveBeenCalled();
  });
});
