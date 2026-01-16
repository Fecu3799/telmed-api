/**
 * Jest setup file for e2e tests.
 * This file runs before all tests and loads environment variables from .env.test
 * with safe defaults for the test database.
 *
 * IMPORTANT: This runs BEFORE any test files are loaded, so it sets up the
 * environment before AppModule's ConfigModule.forRoot() loads .env
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { Pool } from 'pg';
import { execSync } from 'child_process';
import { ensureTestEnv } from './helpers/ensure-test-env';

// Load .env.test if it exists (this takes precedence)
const envTestPath = resolve(process.cwd(), '.env.test');
config({ path: envTestPath });

// Set default DATABASE_URL_TEST if not already set
// This ensures tests always have a test database URL even if .env.test doesn't exist
if (!process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL_TEST =
    'postgresql://app:app@localhost:5432/med_test?schema=public';
}

process.env.NODE_ENV = 'test';

// source-of-truth en tests: Prisma siempre usa DATABASE_URL
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST!;

// Set all required defaults + guard rails before AppModule loads.
ensureTestEnv();

const globalState = globalThis as typeof globalThis & {
  __E2E_MIGRATED__?: boolean;
};

// Hook global: corre antes de cualquier beforeAll/beforeEach del test file
beforeAll(async () => {
  if (!globalState.__E2E_MIGRATED__ && process.env.E2E_MIGRATE !== 'false') {
    execSync('npx prisma migrate deploy', {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
    });
    globalState.__E2E_MIGRATED__ = true;
  }

  if (String(process.env.E2E_DB_LOG).toLowerCase() === 'true') {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const result = await pool.query<{ current_database: string }>(
        'select current_database()',
      );
      const currentDb = result.rows[0]?.current_database;

      console.log(`[e2e] current_database=${currentDb}`);
    } finally {
      await pool.end();
    }
  }
});

// IMPORTANT: After ConfigModule loads .env, it might overwrite DATABASE_URL
// but NOT DATABASE_URL_TEST (since that's not in the schema).
// We need to ensure DATABASE_URL_TEST is preserved and DATABASE_URL is set correctly.
// This will be handled by ensureTestEnv() which runs in beforeAll of each test.
