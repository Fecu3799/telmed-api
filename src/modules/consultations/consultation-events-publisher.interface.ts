/**
 * Interface for publishing consultation-related realtime events.
 * Allows decoupling business logic from infrastructure (Socket.IO, etc.)
 */
export interface ConsultationEventsPublisher {
  /**
   * Publishes a consultation.started event when a consultation transitions to in_progress.
   * This is called after the consultation is persisted in the database.
   * @param payload Event payload with consultation and queue details
   */
  consultationStarted(payload: {
    queueItemId: string;
    consultationId: string;
    roomName: string;
    livekitUrl: string;
    startedAt: Date;
    traceId?: string | null;
  }): void;
}
