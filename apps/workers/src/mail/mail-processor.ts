import { createTransport, type Transporter } from 'nodemailer';
import type { Job } from 'bullmq';
import type { MailSendJob } from '@shopnetic/events';
import type { WorkersEnv } from '../config/env.js';

export function createMailTransport(env: Pick<WorkersEnv, 'SMTP_URL'>): Transporter {
  return createTransport(env.SMTP_URL);
}

/** The actual SMTP delivery — `apps/api` already rendered subject/text, this
 * only sends it (`plan/31-background-jobs-and-queues.md` section 3). BullMQ
 * retries/backs off a thrown error itself; nothing to catch here. */
export function processMailJob(
  transporter: Transporter,
  env: Pick<WorkersEnv, 'MAIL_FROM'>,
): (job: Job<MailSendJob>) => Promise<void> {
  return async (job) => {
    const { to, subject, text } = job.data;
    await transporter.sendMail({ from: env.MAIL_FROM, to, subject, text });
  };
}
