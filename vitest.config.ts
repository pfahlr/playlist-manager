import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/**/test/**/*.test.ts',
      'packages/**/tests/**/*.test.ts',
      'apps/**/src/**/__tests__/**/*.test.ts',
      'codex/code/**/tests/**/*.test.ts',
    ],
    testTimeout: 30000,
    pool: 'threads',
  },
});
