import { describe, expect, test, vi } from 'vitest';
import net from 'node:net';
import type { ChildProcess } from 'node:child_process';

import { ensureApiDevServer } from '../ensure-api-dev.ts';

async function getFreePort() {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unexpected address format');
  }
  const { port } = address;
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  return port;
}

describe('ensureApiDevServer', () => {
  test('spawns the API when target port is free', async () => {
    const port = await getFreePort();
    let exitHandler: (() => void) | undefined;
    const kill = vi.fn(() => exitHandler?.());
    const child = {
      once: vi.fn((event: string, handler: () => void) => {
        if (event === 'exit') {
          exitHandler = handler;
        }
        return child;
      }),
      kill,
    };
    const spawnServer = vi.fn().mockResolvedValue(child as unknown as ChildProcess);

    const result = await ensureApiDevServer({
      port,
      host: '127.0.0.1',
      spawnServer,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    expect(result.state).toBe('spawned');
    expect(spawnServer).toHaveBeenCalledTimes(1);
    result.release();
    expect(kill).toHaveBeenCalled();
    await result.wait;
  });

  test('attaches to an existing API when port is busy', async () => {
    const server = net.createServer();
    await new Promise<void>((resolve, reject) => {
      server.on('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Unexpected address format');
    }

    const spawnServer = vi.fn();
    const result = await ensureApiDevServer({
      port: address.port,
      host: '127.0.0.1',
      spawnServer,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    expect(result.state).toBe('attached');
    expect(spawnServer).not.toHaveBeenCalled();

    result.release();
    await result.wait;
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });
});
