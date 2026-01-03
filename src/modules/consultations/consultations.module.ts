import { Module } from '@nestjs/common';
import { ConsultationsController } from './consultations.controller';
import { ConsultationsService } from './consultations.service';
import { ConsultationRealtimeService } from './consultation-realtime.service';
import { LiveKitService } from './livekit.service';
import { ConsultationRealtimeGateway } from './consultation-realtime.gateway';

@Module({
  controllers: [ConsultationsController],
  providers: [
    ConsultationsService,
    ConsultationRealtimeService,
    LiveKitService,
    ConsultationRealtimeGateway,
  ],
})
export class ConsultationsModule {}
