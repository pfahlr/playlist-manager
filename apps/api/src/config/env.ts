import { z } from 'zod';

const EnvSchema = z.object({
  MASTER_KEY: z
    .string({
      required_error: 'MASTER_KEY env var is required',
    })
    .min(1),
  REDIS_URL: z.string().url().optional(),
  IDEMPOTENCY_STORE_BACKEND: z.enum(['redis', 'memory']).default('redis'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

const IdempotencyTtlSchema = z.coerce
  .number()
  .int()
  .positive()
  .default(15 * 60);

type Env = z.infer<typeof EnvSchema>;
let envCache: Env | null = null;

function loadEnv(): Env {
  if (!envCache) {
    envCache = EnvSchema.parse({
      MASTER_KEY: process.env.MASTER_KEY,
      REDIS_URL: process.env.REDIS_URL,
      IDEMPOTENCY_STORE_BACKEND: process.env.IDEMPOTENCY_STORE_BACKEND,
      NODE_ENV: process.env.NODE_ENV,
    });
  }
  return envCache;
}

export const env: Env = new Proxy({} as Env, {
  get(_target, prop) {
    return loadEnv()[prop as keyof Env];
  },
});

export const IDEMPOTENCY_TTL_SECONDS = IdempotencyTtlSchema.parse(process.env.IDEMPOTENCY_TTL_SECONDS);
