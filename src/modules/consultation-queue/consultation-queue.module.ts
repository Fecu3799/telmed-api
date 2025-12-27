import { Module } from '@nestjs/common';
import { ConsultationQueueController } from './consultation-queue.controller';
import { ConsultationQueueService } from './consultation-queue.service';

@Module({
  controllers: [ConsultationQueueController],
  providers: [ConsultationQueueService],
})
export class ConsultationQueueModule {}
