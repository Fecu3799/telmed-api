/**
 * WebSocket event types and payloads for consultation realtime namespace.
 * Centralized contract for client-server communication.
 */

// Client -> Server events
export type QueueSubscribePayload = { queueItemId: string };
export type QueueUnsubscribePayload = { queueItemId: string };

// Server -> Client events
export type QueueSubscribedPayload = {
  queueItemId: string;
  ok: boolean;
  subscribed: boolean;
};

export type ConsultationStartedPayload = {
  queueItemId: string;
  consultationId: string;
  roomName: string;
  livekitUrl?: string;
  startedAt: string; // ISO timestamp
};
