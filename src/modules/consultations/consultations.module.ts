import { Module, forwardRef } from '@nestjs/common';
import { ConsultationQueueModule } from '../consultation-queue/consultation-queue.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ConsultationsController } from './consultations.controller';
import { ConsultationsService } from './consultations.service';
import { ConsultationRealtimeService } from './consultation-realtime.service';
import { ConsultationAccessService } from './consultation-access.service';
import { LiveKitService } from './livekit.service';
import { ConsultationRealtimeGateway } from './consultation-realtime.gateway';
import { ConsultationEventsPublisher } from './consultation-events-publisher.interface';
import { SocketIoConsultationEventsPublisher } from './socket-io-consultation-events-publisher';
import { NoopConsultationEventsPublisher } from './noop-consultation-events-publisher';
import { PatientsConsultationsController } from './patients-consultations.controller';

// Use Noop publisher in test environment, Socket.IO in others
const eventsPublisherProvider =
  process.env.NODE_ENV === 'test'
    ? {
        provide: 'ConsultationEventsPublisher',
        useClass: NoopConsultationEventsPublisher,
      }
    : {
        provide: 'ConsultationEventsPublisher',
        useClass: SocketIoConsultationEventsPublisher,
      };

/**
 * Consultations module wiring.
 * What it does:
 * - Registers controllers and providers for consultation CRUD/history/realtime.
 * How it works:
 * - Exposes ConsultationsService and realtime publishers to other modules.
 * Gotchas:
 * - History endpoints live here to reuse consultation access + filters.
 */
@Module({
  imports: [forwardRef(() => ConsultationQueueModule), NotificationsModule],
  controllers: [ConsultationsController, PatientsConsultationsController],
  providers: [
    ConsultationsService,
    ConsultationRealtimeService,
    ConsultationAccessService,
    LiveKitService,
    ConsultationRealtimeGateway,
    SocketIoConsultationEventsPublisher,
    NoopConsultationEventsPublisher,
    eventsPublisherProvider,
  ],
  exports: [
    ConsultationsService,
    ConsultationAccessService,
    ConsultationRealtimeGateway,
    LiveKitService,
    'ConsultationEventsPublisher',
  ],
})
export class ConsultationsModule {}
