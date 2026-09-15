import { describe, expect, it, vi } from 'vitest';
import type { Transporter } from 'nodemailer';
import type { Job } from 'bullmq';
import type { MailSendJob } from '@shopnetic/events';
import { processMailJob } from './mail-processor.js';

function fakeJob(data: MailSendJob): Job<MailSendJob> {
  return { data } as Job<MailSendJob>;
}

describe('processMailJob', () => {
  it('sends the job payload as-is via the transporter, from MAIL_FROM', async () => {
    const sendMail = vi.fn().mockResolvedValue(undefined);
    const transporter = { sendMail } as object as Transporter;
    const process = processMailJob(transporter, { MAIL_FROM: 'Shopnetic <no-reply@test>' });

    await process(fakeJob({ to: 'a@b.com', subject: 'Hi', text: 'Body' }));

    expect(sendMail).toHaveBeenCalledWith({
      from: 'Shopnetic <no-reply@test>',
      to: 'a@b.com',
      subject: 'Hi',
      text: 'Body',
    });
  });

  it('propagates a transporter failure — BullMQ retries on a thrown error', async () => {
    const sendMail = vi.fn().mockRejectedValue(new Error('smtp down'));
    const transporter = { sendMail } as object as Transporter;
    const process = processMailJob(transporter, { MAIL_FROM: 'Shopnetic <no-reply@test>' });

    await expect(process(fakeJob({ to: 'a@b.com', subject: 'Hi', text: 'Body' }))).rejects.toThrow(
      'smtp down',
    );
  });
});
