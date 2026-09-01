import { createLogger } from '@shopnetic/observability';

const log = createLogger({ service: 'workers' });

/**
 * Background job processors (BullMQ) — payouts, emails, exports, reindex,
 * report rollups, retention sweeps. See plan/17 §5, plan/30 §3.
 * STUB: boots and idles. Queues + processors land as features need them.
 */
function main(): void {
  log.info('workers stub started (no queues registered yet)');
}

main();
