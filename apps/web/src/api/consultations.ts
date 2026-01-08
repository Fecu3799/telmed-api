import { http } from './http';
import { endpoints } from './endpoints';

export type ConsultationStatus = 'draft' | 'in_progress' | 'closed';

export interface ConsultationQueueSummary {
  id: string;
  entryType: string;
  reason?: string | null;
  paymentStatus?: string | null;
  appointmentId?: string | null;
}

export interface Consultation {
  id: string;
  appointmentId?: string | null;
  queueItemId?: string | null;
  doctorUserId: string;
  patientUserId: string;
  status: ConsultationStatus;
  startedAt?: string | null;
  closedAt?: string | null;
  summary?: string | null;
  notes?: string | null;
  videoProvider?: string | null;
  videoRoomName?: string | null;
  videoCreatedAt?: string | null;
  lastActivityAt?: string | null;
  createdAt: string;
  updatedAt: string;
  queueItem?: ConsultationQueueSummary | null;
  videoUrl?: string | null;
}

export async function getConsultation(
  consultationId: string,
): Promise<Consultation> {
  return http<Consultation>(endpoints.consultations.get(consultationId));
}
