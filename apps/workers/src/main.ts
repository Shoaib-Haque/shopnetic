import { Redis } from 'ioredis';
import { Worker } from 'bullmq';
import { createLogger } from '@shopnetic/observability';
import { QueueName } from '@shopnetic/events';
import { loadWorkersEnv } from './config/env.js';
import { createMailTransport, processMailJob } from './mail/mail-processor.js';

/**
 * Background job processors (BullMQ) — payouts, emails, exports, reindex,
 * report rollups, retention sweeps land here as features need them. See
 * plan/17 section 5, plan/30 section 3, plan/31-background-jobs-and-queues.md.
 *
 * `apps/api` enqueues, this process consumes — split by role, not a staged
 * extraction (plan/31 section 3).
 */
const log = createLogger({ service: 'workers' });

function main(): void {
  const env = loadWorkersEnv();

  // A Worker's connection must set `maxRetriesPerRequest: null` for BullMQ's
  // blocking commands — a dedicated connection, not shared with anything else.
  const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const transporter = createMailTransport(env);

  const mailWorker = new Worker(QueueName.MAIL, processMailJob(transporter, env), {
    connection,
    concurrency: 5,
  });
  mailWorker.on('completed', (job) => log.info({ jobId: job.id }, 'mail job sent'));
  mailWorker.on('failed', (job, err) =>
    log.warn({ jobId: job?.id, err: err.message }, 'mail job failed'),
  );

  log.info('workers started — mail queue active');
}

main();
