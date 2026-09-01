import { defineConfig } from 'vitest/config';

// Unit tests only. DB-backed specs (`*.integration.test.ts`) run via
// `vitest.integration.config.ts` / `pnpm test:integration`.
export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.integration.test.ts'],
  },
});
