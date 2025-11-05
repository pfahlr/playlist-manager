import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import net from 'node:net';
import process from 'node:process';

export type EnsureApiDevOptions = {
  host?: string;
  port?: number;
  spawnServer?: () => ChildProcess | Promise<ChildProcess>;
  logger?: Pick<typeof console, 'info' | 'warn' | 'error'>;
};

export type EnsureApiDevResult =
  | {
      state: 'spawned';
      child: ChildProcess;
      wait: Promise<void>;
      release: () => void;
    }
  | {
      state: 'attached';
      wait: Promise<void>;
      release: () => void;
    };

const defaultLogger = console;

export async function ensureApiDevServer(options: EnsureApiDevOptions = {}): Promise<EnsureApiDevResult> {
  const {
    host = process.env.API_HOST ?? '0.0.0.0',
    port = Number.parseInt(process.env.API_PORT ?? '3101', 10),
    spawnServer = defaultSpawnServer,
    logger = defaultLogger,
  } = options;

  const reachableHost = host === '0.0.0.0' ? '127.0.0.1' : host;
  const inUse = await isPortInUse({ host, port });

  if (!inUse) {
    logger.info?.(`[playlist-manager] launching API on ${host}:${port}`);
    const child = await spawnServer();
    const wait = new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
    });

    return {
      state: 'spawned',
      child,
      wait,
      release: () => {
        logger.info?.('[playlist-manager] shutting down spawned API');
        child.kill('SIGTERM');
      },
    };
  }

  await waitForExistingServer({ host: reachableHost, port, logger });
  logger.info?.(`[playlist-manager] detected existing API on ${reachableHost}:${port}, reusing it`);

  let releaseHandle: (() => void) | undefined;
  const wait = new Promise<void>((resolve) => {
    releaseHandle = resolve;
  });
  const interval = setInterval(() => {
    // Keep the event loop alive while contract tests execute against the existing server
  }, 60_000);

  return {
    state: 'attached',
    wait,
    release: () => {
      clearInterval(interval);
      releaseHandle?.();
    },
  };
}

async function isPortInUse({ host, port }: { host: string; port: number }): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', (error) => {
      if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
        resolve(true);
      } else {
        reject(error);
      }
    });

    server.once('listening', () => {
      server.close(() => resolve(false));
    });

    server.listen(port, host);
  });
}

async function waitForExistingServer({
  host,
  port,
  logger,
}: {
  host: string;
  port: number;
  logger: Pick<typeof console, 'info' | 'warn' | 'error'>;
}): Promise<void> {
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    const connected = await canConnect({ host, port });
    if (connected) {
      return;
    }
    logger.warn?.(`[playlist-manager] waiting for existing API on ${host}:${port}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for API on ${host}:${port}`);
}

async function canConnect({ host, port }: { host: string; port: number }): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port }, () => {
      socket.end();
      resolve(true);
    });

    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function defaultSpawnServer(): ChildProcess {
  return spawn('pnpm', ['api:dev'], {
    stdio: 'inherit',
    env: process.env,
  });
}
