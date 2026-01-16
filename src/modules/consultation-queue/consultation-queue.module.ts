import { Module, forwardRef } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { ConsultationsModule } from '../consultations/consultations.module';
import { GeoModule } from '../geo/geo.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ConsultationQueueController } from './consultation-queue.controller';
import { ConsultationQueueService } from './consultation-queue.service';
import { ConsultationQueueAccessService } from './consultation-queue-access.service';

@Module({
  imports: [
    PaymentsModule,
    forwardRef(() => ConsultationsModule),
    forwardRef(() => GeoModule),
    NotificationsModule,
  ],
  controllers: [ConsultationQueueController],
  providers: [ConsultationQueueService, ConsultationQueueAccessService],
  exports: [ConsultationQueueAccessService, ConsultationQueueService],
})
export class ConsultationQueueModule {
  // ConsultationQueueService injects 'ConsultationEventsPublisher' from ConsultationsModule
  // This is resolved via the forwardRef circular dependency
}
