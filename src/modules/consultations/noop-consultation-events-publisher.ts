import { Injectable } from '@nestjs/common';
import type { ConsultationEventsPublisher } from './consultation-events-publisher.interface';

/**
 * No-op implementation of ConsultationEventsPublisher.
 * Used in test environment to avoid WebSocket infrastructure dependencies.
 */
@Injectable()
export class NoopConsultationEventsPublisher implements ConsultationEventsPublisher {
  consultationStarted(_payload: {
    queueItemId: string;
    consultationId: string;
    roomName: string;
    livekitUrl: string;
    startedAt: Date;
    traceId?: string | null;
  }): void {
    // No-op: do nothing in tests
  }
}
