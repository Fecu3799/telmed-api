import { http } from './http';
import { endpoints } from './endpoints';

export interface ConsultationQueueItem {
  id: string;
  appointmentId: string | null;
  consultationId: string | null;
  patientUserId: string;
  doctorUserId: string;
  status:
    | 'queued'
    | 'accepted'
    | 'rejected'
    | 'cancelled'
    | 'expired'
    | 'in_progress'
    | 'finalized';
  entryType: 'appointment' | 'emergency';
  paymentStatus:
    | 'not_required'
    | 'not_started'
    | 'pending'
    | 'paid'
    | 'failed'
    | 'expired';
  reason: string | null;
  queuedAt: string;
  acceptedAt: string | null;
  cancelledAt: string | null;
  closedAt: string | null;
  expiresAt: string | null;
  paymentExpiresAt: string | null;
  createdBy: string;
  acceptedBy: string | null;
  cancelledBy: string | null;
}

export interface CreateQueueRequest {
  appointmentId?: string;
  doctorUserId: string;
  patientUserId?: string;
  reason?: string;
}

export interface PaymentCheckout {
  checkoutUrl: string;
  expiresAt: string;
  status: string;
}

export interface StartQueueResponse {
  queueItem: ConsultationQueueItem;
  consultation: {
    id: string;
    appointmentId: string | null;
    patientUserId: string;
    doctorUserId: string;
    status: string;
    startedAt: string;
    finalizedAt: string | null;
    closedAt: string | null;
  };
  videoUrl?: string;
}

export async function createQueue(
  data: CreateQueueRequest,
): Promise<ConsultationQueueItem> {
  return http<ConsultationQueueItem>(endpoints.queue.create, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getQueue(
  queueItemId: string,
): Promise<ConsultationQueueItem> {
  return http<ConsultationQueueItem>(endpoints.queue.get(queueItemId));
}

export async function listQueue(
  includeClosed?: boolean,
): Promise<ConsultationQueueItem[]> {
  const query = includeClosed ? '?includeClosed=true' : '';
  return http<ConsultationQueueItem[]>(`${endpoints.queue.list}${query}`);
}

export async function acceptQueue(
  queueItemId: string,
): Promise<ConsultationQueueItem> {
  return http<ConsultationQueueItem>(endpoints.queue.accept(queueItemId), {
    method: 'POST',
  });
}

export async function rejectQueue(
  queueItemId: string,
  reason?: string,
): Promise<ConsultationQueueItem> {
  return http<ConsultationQueueItem>(endpoints.queue.reject(queueItemId), {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function cancelQueue(
  queueItemId: string,
  reason: string,
): Promise<ConsultationQueueItem> {
  return http<ConsultationQueueItem>(endpoints.queue.cancel(queueItemId), {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function payForQueue(
  queueItemId: string,
): Promise<PaymentCheckout> {
  return http<PaymentCheckout>(endpoints.queue.payment(queueItemId), {
    method: 'POST',
  });
}

export async function startQueue(
  queueItemId: string,
): Promise<StartQueueResponse> {
  return http<StartQueueResponse>(endpoints.queue.start(queueItemId), {
    method: 'POST',
  });
}
