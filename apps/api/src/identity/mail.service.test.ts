import { describe, expect, it, vi } from 'vitest';
import type { MailSendJob } from '@shopnetic/events';
import type { MailQueueService } from '../queue/mail-queue.service.js';
import { MailService } from './mail.service.js';

function fakeQueue(): { enqueue: ReturnType<typeof vi.fn>; queue: MailQueueService } {
  const enqueue = vi.fn().mockResolvedValue(undefined);
  return { enqueue, queue: { enqueue } as object as MailQueueService };
}

function lastJob(enqueue: ReturnType<typeof vi.fn>): MailSendJob {
  return enqueue.mock.calls.at(-1)?.[0] as MailSendJob;
}

describe('MailService', () => {
  it('sendVerification renders the link into the template and enqueues once', async () => {
    const { enqueue, queue } = fakeQueue();
    await new MailService(queue).sendVerification('a@b.com', 'https://x/verify?token=t1');

    expect(enqueue).toHaveBeenCalledTimes(1);
    const job = lastJob(enqueue);
    expect(job.to).toBe('a@b.com');
    expect(job.subject).toBe('Confirm your Shopnetic email address');
    expect(job.text).toContain('https://x/verify?token=t1');
  });

  it('sendAlreadyRegistered points at the login link, not a verify link', async () => {
    const { enqueue, queue } = fakeQueue();
    await new MailService(queue).sendAlreadyRegistered('a@b.com', 'https://x/login');

    const job = lastJob(enqueue);
    expect(job.subject).toBe('You already have a Shopnetic account');
    expect(job.text).toContain('https://x/login');
  });

  it('sendStaffInvite substitutes both the link and the role', async () => {
    const { enqueue, queue } = fakeQueue();
    await new MailService(queue).sendStaffInvite('a@b.com', 'https://x/accept?t=t2', 'ADMIN');

    const job = lastJob(enqueue);
    expect(job.subject).toBe('You have been invited to the Shopnetic back office');
    expect(job.text).toContain('https://x/accept?t=t2');
    expect(job.text).toContain('as ADMIN');
  });

  it('sendStaffPasswordReset renders the reset link', async () => {
    const { enqueue, queue } = fakeQueue();
    await new MailService(queue).sendStaffPasswordReset('a@b.com', 'https://x/reset?t=t3');

    const job = lastJob(enqueue);
    expect(job.subject).toBe('Reset your Shopnetic staff password');
    expect(job.text).toContain('https://x/reset?t=t3');
  });
});
