import { z } from 'zod';

const EnvSchema = z.object({
  MASTER_KEY: z
    .string({
      required_error: 'MASTER_KEY env var is required',
    })
    .min(1),
});

export const env = EnvSchema.parse({
  MASTER_KEY: process.env.MASTER_KEY,
});
