import { Module, forwardRef } from '@nestjs/common';
import { ConsultationQueueModule } from '../consultation-queue/consultation-queue.module';
import { ConsultationsController } from './consultations.controller';
import { ConsultationsService } from './consultations.service';
import { ConsultationRealtimeService } from './consultation-realtime.service';
import { ConsultationAccessService } from './consultation-access.service';
import { LiveKitService } from './livekit.service';
import { ConsultationRealtimeGateway } from './consultation-realtime.gateway';
import { ConsultationEventsPublisher } from './consultation-events-publisher.interface';
import { SocketIoConsultationEventsPublisher } from './socket-io-consultation-events-publisher';
import { NoopConsultationEventsPublisher } from './noop-consultation-events-publisher';

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

@Module({
  imports: [forwardRef(() => ConsultationQueueModule)],
  controllers: [ConsultationsController],
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
    ConsultationAccessService,
    ConsultationRealtimeGateway,
    LiveKitService,
    'ConsultationEventsPublisher',
  ],
})
export class ConsultationsModule {}
