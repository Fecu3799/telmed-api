/**
 * Ensures test environment is properly configured.
 *
 * Requirements:
 * - DATABASE_URL_TEST must be set
 * - DATABASE_URL must point to the test database
 *
 * This function sets process.env.DATABASE_URL to DATABASE_URL_TEST
 * so that PrismaService and all database operations use the test database.
 */
export function ensureTestEnv() {
  // Set required env vars explicitly for deterministic tests (ignore .env)
  process.env.APP_ENV = 'test';
  process.env.NODE_ENV = 'test';
  process.env.THROTTLE_ENABLED = 'false';
  process.env.RATE_LIMIT_ENABLED = 'false';
  process.env.APP_PORT = '3001';
  process.env.JWT_ACCESS_SECRET = 'test_access_secret_123456';
  process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_123456';
  process.env.JWT_ACCESS_TTL_SECONDS = '900';
  process.env.JWT_REFRESH_TTL_SECONDS = '2592000';
  process.env.DEBUG_AUTH = 'false';
  process.env.DEBUG_DB = 'false';
  process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
  process.env.WORKERS_ENABLED = 'false';
  process.env.MERCADOPAGO_ACCESS_TOKEN = 'test_mp_access_token';
  process.env.MERCADOPAGO_WEBHOOK_SECRET = 'test_mp_webhook_secret';
  process.env.FORMATTER_PROVIDER = 'dummy';
  process.env.CLINICAL_NOTE_FORMAT_PROVIDER = 'dummy';

  // Validate DATABASE_URL_TEST is set
  const databaseUrlTest = process.env.DATABASE_URL_TEST;
  if (!databaseUrlTest || databaseUrlTest.trim() === '') {
    throw new Error(
      'DATABASE_URL_TEST must be set for e2e tests. ' +
        'This ensures tests run against a separate test database and not the development database.',
    );
  }

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = databaseUrlTest;

  const actualDbName = getDbNameFromUrl(process.env.DATABASE_URL);
  const expectedDbName = getDbNameFromUrl(databaseUrlTest) || 'med_test';

  // Final airbag: never run if DATABASE_URL doesn't point to test DB
  if (!actualDbName || actualDbName !== expectedDbName) {
    throw new Error(
      `Refusing to run e2e against non-test DB. ` +
        `DATABASE_URL=${process.env.DATABASE_URL} (db=${actualDbName ?? 'unknown'})`,
    );
  }
}

function getDbNameFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname || '';
    const name = pathname.startsWith('/') ? pathname.slice(1) : pathname;
    return name || null;
  } catch {
    return null;
  }
}
