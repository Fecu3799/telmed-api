/**
 * Ensures test environment is properly configured.
 *
 * Requirements:
 * - DATABASE_URL_TEST must be set
 * - DATABASE_URL_TEST must be different from DATABASE_URL (safety check)
 *
 * This function sets process.env.DATABASE_URL to DATABASE_URL_TEST
 * so that PrismaService and all database operations use the test database.
 */
export function ensureTestEnv() {
  // Set other required env vars with defaults
  process.env.APP_ENV = process.env.APP_ENV ?? 'test';
  process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
  process.env.THROTTLE_ENABLED = process.env.THROTTLE_ENABLED ?? 'false';
  process.env.APP_PORT = process.env.APP_PORT ?? '0';
  process.env.JWT_ACCESS_SECRET =
    process.env.JWT_ACCESS_SECRET ?? 'test_access_secret_123456';
  process.env.JWT_REFRESH_SECRET =
    process.env.JWT_REFRESH_SECRET ?? 'test_refresh_secret_123456';
  process.env.JWT_ACCESS_TTL_SECONDS =
    process.env.JWT_ACCESS_TTL_SECONDS ?? '900';
  process.env.JWT_REFRESH_TTL_SECONDS =
    process.env.JWT_REFRESH_TTL_SECONDS ?? '2592000';
  process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
  process.env.MERCADOPAGO_ACCESS_TOKEN =
    process.env.MERCADOPAGO_ACCESS_TOKEN ?? 'test_mp_access_token';
  process.env.MERCADOPAGO_WEBHOOK_SECRET =
    process.env.MERCADOPAGO_WEBHOOK_SECRET ?? 'test_mp_webhook_secret';

  // Validate DATABASE_URL_TEST is set
  const databaseUrlTest = process.env.DATABASE_URL_TEST;
  if (!databaseUrlTest || databaseUrlTest.trim() === '') {
    throw new Error(
      'DATABASE_URL_TEST must be set for e2e tests. ' +
        'This ensures tests run against a separate test database and not the development database.',
    );
  }

  // Get DATABASE_URL for comparison (may be undefined in test environment)
  const databaseUrl = process.env.DATABASE_URL;

  // Safety check: ensure DATABASE_URL_TEST is different from DATABASE_URL
  if (databaseUrl && databaseUrl.trim() === databaseUrlTest.trim()) {
    throw new Error(
      'DATABASE_URL_TEST must be different from DATABASE_URL. ' +
        'Tests must use a separate database to avoid data loss. ' +
        `Both are set to: ${databaseUrlTest}`,
    );
  }

  // Set DATABASE_URL to DATABASE_URL_TEST so PrismaService uses the test database
  process.env.DATABASE_URL = databaseUrlTest;
}
