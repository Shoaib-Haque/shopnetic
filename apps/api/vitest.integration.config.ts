import { defineConfig } from 'vitest/config';

// DB-backed integration specs. Needs DATABASE_URL pointed at a migrated + seeded
// Postgres (CI provides one; locally: the docker-compose DB on :5433).
export default defineConfig({
  test: {
    include: ['**/*.integration.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
