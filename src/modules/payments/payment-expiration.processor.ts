import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { CLOCK, type Clock } from '../../common/clock/clock';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  EXPIRE_PENDING_PAYMENTS_JOB,
  PAYMENTS_QUEUE,
} from './payment-expiration.constants';
import { PaymentsService } from './payments.service';

/**
 * Worker that expires pending payments that are past their expiration window.
 * What it does:
 * - Scans pending payments with expiresAt < now and marks them expired.
 * How it works:
 * - Processes in small batches to avoid long transactions.
 */
@Processor(PAYMENTS_QUEUE)
export class PaymentExpirationProcessor extends WorkerHost {
  private readonly logger = new Logger(PaymentExpirationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== EXPIRE_PENDING_PAYMENTS_JOB) {
      return;
    }

    const startedAt = Date.now();
    const now = this.clock.now();
    let expiredCount = 0;

    // Process in batches to keep each loop light.
    while (true) {
      const pending = await this.prisma.payment.findMany({
        where: {
          status: PaymentStatus.pending,
          expiresAt: { lt: now },
        },
        select: { id: true },
        orderBy: { expiresAt: 'asc' },
        take: 100,
      });

      if (pending.length === 0) {
        break;
      }

      for (const payment of pending) {
        const updated = await this.paymentsService.markPaymentExpired({
          paymentId: payment.id,
          reason: 'payment_window_expired',
        });
        if (updated) {
          expiredCount += 1;
        }
      }
    }

    this.logger.log(
      JSON.stringify({
        event: 'payments_expire_job_run',
        expiredCount,
        durationMs: Date.now() - startedAt,
        jobId: job.id ?? null,
      }),
    );
  }
}
