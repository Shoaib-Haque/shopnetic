import { createLogger } from '@shopnetic/observability';

const log = createLogger({ service: 'search-indexer' });

/**
 * Search index sync worker — see plan/11-search-and-catalog.md §4.
 * STUB: boots and idles. Consumes catalog/inventory/review events and upserts
 * documents into the search engine; full reindex + drift repair jobs land later.
 */
function main(): void {
  log.info('search-indexer stub started (no consumer bound yet)');
}

main();
