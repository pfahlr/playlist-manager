import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@app/contracts': path.resolve(rootDir, 'packages/contracts/src/index.ts'),
      '@app/interop': path.resolve(rootDir, 'packages/interop/src'),
      '@app/db': path.resolve(rootDir, 'packages/db/src/index.ts'),
      '@app/providers-spotify': path.resolve(rootDir, 'packages/providers/spotify/src/index.ts'),
      '@app/providers-deezer': path.resolve(rootDir, 'packages/providers/deezer/src/index.ts'),
      '@app/providers-tidal': path.resolve(rootDir, 'packages/providers/tidal/src/index.ts'),
      '@app/providers-youtube': path.resolve(rootDir, 'packages/providers/youtube/src/index.ts'),
      nock: path.resolve(rootDir, 'codex/support/nock.ts'),
    },
  },
  test: {
    include: [
      'packages/**/test/**/*.test.ts',
      'packages/**/tests/**/*.test.ts',
      'apps/**/src/**/__tests__/**/*.test.ts',
      'codex/code/**/tests/**/*.test.ts',
    ],
    testTimeout: 30000,
    pool: 'threads',
    server: {
      deps: {
        inline: ['fastify', '@app/contracts', 'nanoid'],
      },
    },
  },
});
