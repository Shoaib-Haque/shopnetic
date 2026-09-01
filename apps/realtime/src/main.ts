import { createLogger } from '@shopnetic/observability';

const log = createLogger({ service: 'realtime' });

/**
 * Socket.IO gateway — see plan/15-realtime-and-notifications.md.
 * STUB: boots and idles. Namespaces (/buyer, /seller, /admin), the Redis
 * adapter, JWT auth on connect, and the event→emit projection land later.
 */
function main(): void {
  log.info('realtime gateway stub started (no server bound yet)');
}

main();
