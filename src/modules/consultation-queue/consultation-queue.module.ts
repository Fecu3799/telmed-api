import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { ConsultationQueueController } from './consultation-queue.controller';
import { ConsultationQueueService } from './consultation-queue.service';

@Module({
  imports: [PaymentsModule],
  controllers: [ConsultationQueueController],
  providers: [ConsultationQueueService],
})
export class ConsultationQueueModule {}
