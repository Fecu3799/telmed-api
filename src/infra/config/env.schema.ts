// src/infra/config/env.schema.ts
import { z } from 'zod';

function formatEnvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  if (typeof value === 'symbol') {
    return value.toString();
  }
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable]';
  }
}

export const envSchema = z.object({
  APP_ENV: z.string().default('local'),
  APP_PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().min(1), // <- clave

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),

  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive(),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive(),

  REDIS_URL: z.string().min(1),
  THROTTLE_ENABLED: z
    .preprocess((value) => {
      if (value === undefined || value === null || value === '') {
        return true;
      }
      return formatEnvValue(value).toLowerCase() !== 'false';
    }, z.boolean())
    .default(true),
  DEBUG_AUTH: z
    .preprocess((value) => {
      if (value === undefined || value === null || value === '') {
        return false;
      }
      return formatEnvValue(value).toLowerCase() === 'true';
    }, z.boolean())
    .default(false),
  DEBUG_SEARCH: z
    .preprocess((value) => {
      if (value === undefined || value === null || value === '') {
        return false;
      }
      return formatEnvValue(value).toLowerCase() === 'true';
    }, z.boolean())
    .default(false),
  SLOW_QUERY_MS: z
    .preprocess((value) => {
      if (value === undefined || value === null || value === '') {
        return 200;
      }
      return Number(value);
    }, z.number().int().min(0))
    .refine(
      (value) => (process.env.NODE_ENV !== 'production' ? true : value > 0),
      {
        message: 'SLOW_QUERY_MS must be > 0 in production',
      },
    )
    .default(200),
});

export type EnvSchema = z.infer<typeof envSchema>;
