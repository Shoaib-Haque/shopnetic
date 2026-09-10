import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Component tests need a DOM (jsdom) and the `@/*` alias Next resolves via
// tsconfig `paths` but Vite doesn't read automatically. Pure-logic specs
// (reorder.test.ts) don't need either — jsdom is a superset, so one config
// covers both rather than splitting like apps/api's unit/integration configs.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  // tsconfig sets `jsx: "preserve"` (Next's own compiler handles it in the app
  // build) — override for the test transform, or Vite leaves JSX untransformed
  // and every component test fails with "React is not defined".
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    exclude: ['**/node_modules/**', '**/.next/**'],
  },
});
