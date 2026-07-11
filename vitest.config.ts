import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Resolve the @forrest/shared workspace package to its TS source so tests run
// without a build step. Keep the single-source-of-truth: scoring imports the
// canonical constants from packages/shared — never re-declares them.
const sharedSrc = fileURLToPath(new URL('./packages/shared/src', import.meta.url));
const scoringSrc = fileURLToPath(new URL('./packages/scoring/src', import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: '@forrest/shared/constants', replacement: `${sharedSrc}/constants.ts` },
      { find: '@forrest/shared', replacement: sharedSrc },
      { find: '@forrest/scoring', replacement: scoringSrc },
    ],
  },
  test: {
    environment: 'node',
    include: ['packages/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
