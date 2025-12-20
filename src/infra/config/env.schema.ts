import { z } from 'zod';

export const envSchema = z.object({
  APP_ENV: z.string().default('local'),
  APP_PORT: z.coerce.number().int().positive().default(3000),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive(),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive(),
  REDIS_URL: z.string().url(),
});

export type EnvSchema = z.infer<typeof envSchema>;
