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

// Load .env.test if it exists (this takes precedence)
const envTestPath = resolve(process.cwd(), '.env.test');
config({ path: envTestPath });

// Store original DATABASE_URL if it exists (from shell or .env)
const originalDatabaseUrl = process.env.DATABASE_URL;

// Set default DATABASE_URL_TEST if not already set
// This ensures tests always have a test database URL even if .env.test doesn't exist
if (!process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL_TEST =
    'postgresql://app:app@localhost:5432/med_test?schema=public';
}

// Set default DATABASE_URL for dev if not already set (for safety check)
// This is the dev database URL from docker-compose.yml
// We preserve the original if it was set, otherwise use the default
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    'postgresql://app:app@localhost:5432/med?schema=public';
}

// IMPORTANT: After ConfigModule loads .env, it might overwrite DATABASE_URL
// but NOT DATABASE_URL_TEST (since that's not in the schema).
// We need to ensure DATABASE_URL_TEST is preserved and DATABASE_URL is set correctly.
// This will be handled by ensureTestEnv() which runs in beforeAll of each test.
