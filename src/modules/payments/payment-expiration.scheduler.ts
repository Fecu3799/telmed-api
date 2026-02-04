import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import {
  EXPIRE_PENDING_PAYMENTS_EVERY_MS,
  EXPIRE_PENDING_PAYMENTS_JOB,
  PAYMENTS_QUEUE,
} from './payment-expiration.constants';

/**
 * Schedules repeatable payment expiration scans.
 * What it does:
 * - Enqueues a repeatable BullMQ job to expire pending payments.
 * How it works:
 * - Runs every minute (configurable in code) unless disabled by env.
 */
@Injectable()
export class PaymentExpirationScheduler implements OnModuleInit {
  private readonly logger = new Logger(PaymentExpirationScheduler.name);

  constructor(
    @InjectQueue(PAYMENTS_QUEUE) private readonly queue: Queue,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    const enabled =
      this.configService.get<boolean>('PAYMENTS_EXPIRATION_JOB_ENABLED') ??
      true;

    if (
      !enabled ||
      process.env.NODE_ENV === 'test' ||
      process.env.APP_ENV === 'test'
    ) {
      return;
    }

    try {
      await this.queue.add(
        EXPIRE_PENDING_PAYMENTS_JOB,
        {},
        {
          jobId: EXPIRE_PENDING_PAYMENTS_JOB,
          repeat: { every: EXPIRE_PENDING_PAYMENTS_EVERY_MS },
        },
      );
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'payments_expire_job_schedule_failed',
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
}
