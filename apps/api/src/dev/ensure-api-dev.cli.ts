import process from 'node:process';

import { ensureApiDevServer } from './ensure-api-dev.ts';

const result = await ensureApiDevServer();

const shutdown = () => {
  result.release();
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

if (result.state === 'spawned') {
  result.child.once('exit', (code, signal) => {
    if (typeof code === 'number') {
      process.exitCode = code;
      return;
    }

    if (signal) {
      process.exitCode = 1;
    }
  });
}

await result.wait;
