import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { AppModule } from './app.module';

/**
 * Worker entry point for BullMQ processors.
 * What it does:
 * - Bootstraps NestJS application in worker mode (only processors, no HTTP server).
 * How it works:
 * - Verifies Redis connection, then creates NestJS app, initializes modules, processors start automatically.
 * Gotchas:
 * - Does not start HTTP server; only runs background job processors.
 * - Requires Redis to be running (same REDIS_URL as the API).
 */
async function checkRedisConnection(redisUrl: string): Promise<boolean> {
  const testClient = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
    lazyConnect: true,
  });

  try {
    await testClient.connect();
    await testClient.ping();
    await testClient.quit();
    return true;
  } catch {
    try {
      await testClient.quit();
    } catch {
      // Ignore quit errors
    }
    return false;
  }
}

async function bootstrapWorker() {
  const logger = new Logger('WorkerBootstrap');

  try {
    process.env.APP_PROCESS_ROLE = process.env.APP_PROCESS_ROLE ?? 'worker';
    logger.log('Starting clinical note format worker...');

    // Check Redis connection before initializing app
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      logger.error(
        'REDIS_URL environment variable is not set. Worker requires Redis to process jobs.',
      );
      process.exit(1);
    }

    logger.log(`Checking Redis connection at ${redisUrl}...`);
    const redisAvailable = await checkRedisConnection(redisUrl);

    if (!redisAvailable) {
      logger.error(
        `❌ Cannot connect to Redis at ${redisUrl}. Please ensure Redis is running.`,
      );
      logger.error(
        'Start Redis with: docker compose up -d redis (or npm run dev:infra)',
      );
      process.exit(1);
    }

    logger.log('✅ Redis connection verified');

    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn', 'log'],
    });

    logger.log('Worker started successfully. Processing jobs...');

    // Prevent multiple shutdown attempts
    let isShuttingDown = false;

    const shutdown = async (signal: string) => {
      if (isShuttingDown) {
        return;
      }
      isShuttingDown = true;

      logger.log(`${signal} received, shutting down worker...`);
      try {
        await app.close();
      } catch (error) {
        logger.warn('Error during shutdown:', error);
      }
      process.exit(0);
    };

    // Keep the process alive
    process.on('SIGTERM', () => {
      void shutdown('SIGTERM');
    });
    process.on('SIGINT', () => {
      void shutdown('SIGINT');
    });
  } catch (error) {
    logger.error('Failed to start worker', error);
    process.exit(1);
  }
}

void bootstrapWorker();
