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

const isTestEnv = process.env.NODE_ENV === 'test';
const isProdEnv = process.env.NODE_ENV === 'production';

export const envSchema = z.object({
  APP_ENV: z.string().default('local'),
  APP_PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().min(1), // <- clave

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),

  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive(),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive(),

  REDIS_URL: z.string().min(1),
  GEO_GEOCODER_PROVIDER: z
    .enum(['nominatim', 'stub'])
    .default(isTestEnv ? 'stub' : 'nominatim'),
  GEO_GEOCODER_TIMEOUT_MS: z.coerce.number().int().min(100).default(2500),
  GEO_GEOCODER_USER_AGENT: z.string().min(1).default('telmed-api'),
  MERCADOPAGO_ACCESS_TOKEN: isTestEnv
    ? z.string().default('test_mp_access_token')
    : z.string().min(1),
  MERCADOPAGO_WEBHOOK_SECRET: isTestEnv
    ? z.string().default('test_mp_webhook_secret')
    : z.string().min(1),
  MERCADOPAGO_WEBHOOK_URL: z.string().min(1).optional(),
  MERCADOPAGO_BASE_URL: z.string().min(1).optional(),
  MERCADOPAGO_MODE: z
    .enum(['sandbox', 'live'])
    .default(isProdEnv ? 'live' : 'sandbox'),
  LIVEKIT_URL: isTestEnv
    ? z.string().default('wss://example.test')
    : z.string().min(1),
  LIVEKIT_API_KEY: isTestEnv ? z.string().default('test') : z.string().min(1),
  LIVEKIT_API_SECRET: isTestEnv
    ? z.string().default('test')
    : z.string().min(1),
  LIVEKIT_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  STORAGE_PROVIDER: z.enum(['minio', 's3']).default(isProdEnv ? 's3' : 'minio'),
  S3_ENDPOINT: z.string().min(1).optional(),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_BUCKET:
    isTestEnv || !isProdEnv
      ? z.string().default('dev-bucket')
      : z.string().min(1),
  S3_ACCESS_KEY_ID:
    isTestEnv || !isProdEnv
      ? z.string().default('dev-access-key')
      : z.string().min(1),
  S3_SECRET_ACCESS_KEY:
    isTestEnv || !isProdEnv
      ? z.string().default('dev-secret-key')
      : z.string().min(1),
  S3_FORCE_PATH_STYLE: z
    .preprocess((value) => {
      if (value === undefined || value === null || value === '') {
        return undefined;
      }
      return formatEnvValue(value).toLowerCase() === 'true';
    }, z.boolean())
    .optional(),
  PRESIGN_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  CONSULTATION_FILE_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(10485760),
  PATIENT_FILE_MAX_BYTES_PATIENT: z.coerce
    .number()
    .int()
    .positive()
    .default(20971520), // 20MB
  PATIENT_FILE_MAX_BYTES_DOCTOR: z.coerce
    .number()
    .int()
    .positive()
    .default(104857600), // 100MB
  THROTTLE_ENABLED: z
    .preprocess((value) => {
      if (value === undefined || value === null || value === '') {
        return true;
      }
      return formatEnvValue(value).toLowerCase() !== 'false';
    }, z.boolean())
    .default(true),
  THROTTLE_BENCHMARK_MODE: z
    .preprocess((value) => {
      if (value === undefined || value === null || value === '') {
        return false;
      }
      return formatEnvValue(value).toLowerCase() === 'true';
    }, z.boolean())
    .default(false),
  THROTTLE_TTL_SECONDS_DEV: z
    .preprocess((value) => {
      if (value === undefined || value === null || value === '') {
        return 60;
      }
      return Number(value);
    }, z.number().int().min(1))
    .default(60),
  THROTTLE_LIMIT_DEV: z
    .preprocess((value) => {
      if (value === undefined || value === null || value === '') {
        return 1000;
      }
      return Number(value);
    }, z.number().int().min(1))
    .default(1000),
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
  // Performance monitoring
  SLOW_REQ_THRESHOLD_MS: z
    .preprocess((value) => {
      if (value === undefined || value === null || value === '') {
        return 500;
      }
      return Number(value);
    }, z.number().int().min(0))
    .default(500),
  PERF_METRICS_ENABLED: z
    .preprocess((value) => {
      if (value === undefined || value === null || value === '') {
        return !isProdEnv;
      }
      return formatEnvValue(value).toLowerCase() === 'true';
    }, z.boolean())
    .default(!isProdEnv),
  PERF_ENDPOINT_ENABLED: z
    .preprocess((value) => {
      if (value === undefined || value === null || value === '') {
        return !isProdEnv;
      }
      return formatEnvValue(value).toLowerCase() === 'true';
    }, z.boolean())
    .default(!isProdEnv),
  PERF_DEBUG_TOKEN: z.string().min(1).optional(),
  PRISMA_QUERY_LOG_ENABLED: z
    .preprocess((value) => {
      if (value === undefined || value === null || value === '') {
        return false;
      }
      return formatEnvValue(value).toLowerCase() === 'true';
    }, z.boolean())
    .default(false),
  PRISMA_SLOW_QUERY_MS: z
    .preprocess((value) => {
      if (value === undefined || value === null || value === '') {
        return 200;
      }
      return Number(value);
    }, z.number().int().min(0))
    .default(200),
  PERF_MAX_SLOW_REQUESTS: z
    .preprocess((value) => {
      if (value === undefined || value === null || value === '') {
        return 200;
      }
      return Number(value);
    }, z.number().int().min(1))
    .default(200),
  PERF_MAX_SLOW_QUERIES: z
    .preprocess((value) => {
      if (value === undefined || value === null || value === '') {
        return 200;
      }
      return Number(value);
    }, z.number().int().min(1))
    .default(200),
  PERF_TOP_N: z
    .preprocess((value) => {
      if (value === undefined || value === null || value === '') {
        return 20;
      }
      return Number(value);
    }, z.number().int().min(1))
    .default(20),
  PERF_SAMPLE_RATE: z
    .preprocess((value) => {
      if (value === undefined || value === null || value === '') {
        return 1.0;
      }
      const num = Number(value);
      return num >= 0 && num <= 1 ? num : 1.0;
    }, z.number().min(0).max(1))
    .default(1.0),
  GEO_EMERGENCY_DAILY_LIMIT: z.coerce.number().int().positive().default(5),
  GEO_EMERGENCY_MONTHLY_LIMIT: z.coerce.number().int().positive().default(30),
  // Clinical Note Format
  FORMATTER_PROVIDER: z.enum(['dummy', 'openai']).default('dummy'),
  CLINICAL_NOTE_FORMAT_PROVIDER: z.enum(['dummy', 'openai']).default('dummy'),
  CLINICAL_NOTE_FORMAT_CONCURRENCY: z.coerce
    .number()
    .int()
    .positive()
    .default(2),
  CLINICAL_NOTE_FORMAT_MAX_ATTEMPTS: z.coerce
    .number()
    .int()
    .positive()
    .default(3),
  CLINICAL_NOTE_FORMAT_BACKOFF_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(5000),
  // OpenAI (required if provider=openai)
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_BASE_URL: z.preprocess((value) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    return value;
  }, z.string().url().optional()),
});

export type EnvSchema = z.infer<typeof envSchema>;
