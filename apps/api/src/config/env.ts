import { z } from 'zod';

const EnvSchema = z.object({
  MASTER_KEY: z
    .string({
      required_error: 'MASTER_KEY env var is required',
    })
    .min(1),
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
