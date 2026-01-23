import { Injectable, Logger } from '@nestjs/common';
import { ConsultationRealtimeGateway } from './consultation-realtime.gateway';
import type { ConsultationEventsPublisher } from './consultation-events-publisher.interface';

/**
 * Adapter de eventos de consulta para Socket.IO
 * - Implementación de ConsultationEventsPublisher que publica eventos de dominio vía ConsultationRealtimeGateway.
 *
 * How it works:
 * - consultationStarted: llama a gateway.emitConsultationStarted(...) dentro de try/catch (no rompe request si falla).
 */
@Injectable()
export class SocketIoConsultationEventsPublisher implements ConsultationEventsPublisher {
  private readonly logger = new Logger(
    SocketIoConsultationEventsPublisher.name,
  );

  constructor(private readonly realtimeGateway: ConsultationRealtimeGateway) {}

  consultationStarted(payload: {
    queueItemId: string;
    consultationId: string;
    roomName: string;
    livekitUrl: string;
    startedAt: Date;
    traceId?: string | null;
  }): void {
    try {
      this.realtimeGateway.emitConsultationStarted(
        payload.queueItemId,
        payload.consultationId,
        payload.roomName,
        payload.livekitUrl,
        payload.startedAt,
        payload.traceId,
      );
    } catch (error) {
      // Log but don't throw: event publishing should not break the request
      this.logger.warn(
        JSON.stringify({
          event: 'consultation_started_publish_failed',
          queueItemId: payload.queueItemId,
          consultationId: payload.consultationId,
          traceId: payload.traceId ?? null,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
}
