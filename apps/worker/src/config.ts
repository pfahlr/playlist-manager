import { z } from 'zod';

export type WorkerRedisConnectionOptions = {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  tls?: Record<string, unknown>;
};

const EnvSchema = z.object({
  WORKER_REDIS_URL: z
    .string()
    .url()
    .default('redis://127.0.0.1:6379'),
  MASTER_KEY: z
    .string()
    .min(1, 'MASTER_KEY is required for token encryption')
    .describe('Master encryption key for provider tokens'),
});

const parsedEnv = EnvSchema.parse({
  WORKER_REDIS_URL:
    process.env.WORKER_REDIS_URL ?? process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
  MASTER_KEY: process.env.MASTER_KEY,
});

export const workerConfig = {
  redisUrl: parsedEnv.WORKER_REDIS_URL,
  masterKey: parsedEnv.MASTER_KEY,
  snapshotGcCron: '0 3 * * *',
} as const;

export const redisConnection: WorkerRedisConnectionOptions = parseRedisUrl(workerConfig.redisUrl);

function parseRedisUrl(urlString: string): WorkerRedisConnectionOptions {
  const url = new URL(urlString);
  const options: WorkerRedisConnectionOptions = {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
  };

  if (url.username) {
    options.username = decodeURIComponent(url.username);
  }
  if (url.password) {
    options.password = decodeURIComponent(url.password);
  }

  if (url.pathname && url.pathname.length > 1) {
    const dbValue = Number(url.pathname.replace('/', ''));
    if (!Number.isNaN(dbValue)) {
      options.db = dbValue;
    }
  }

  if (url.protocol === 'rediss:') {
    options.tls = {};
  }

  return options;
}
