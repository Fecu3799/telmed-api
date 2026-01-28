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

export type ActiveConsultation = {
  consultationId: string;
  queueItemId?: string | null;
  appointmentId?: string | null;
  status: ConsultationStatus;
};

export async function getActiveConsultation(): Promise<{
  consultation: ActiveConsultation | null;
}> {
  return http<{ consultation: ActiveConsultation | null }>(
    endpoints.consultations.active,
  );
}

export async function closeConsultation(
  consultationId: string,
): Promise<Consultation> {
  return http<Consultation>(endpoints.consultations.close(consultationId), {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

type ConsultationHistoryQuery = {
  page?: number;
  pageSize?: number;
  status?: ConsultationStatus;
  from?: string;
  to?: string;
};

export type ConsultationHistoryParticipant = {
  id: string;
  displayName: string;
};

export type ConsultationHistoryItem = {
  id: string;
  status: ConsultationStatus;
  createdAt: string;
  startedAt?: string | null;
  closedAt?: string | null;
  doctor: ConsultationHistoryParticipant;
  patient?: ConsultationHistoryParticipant;
  hasClinicalFinal?: boolean;
};

export type ConsultationHistoryResponse = {
  items: ConsultationHistoryItem[];
  pageInfo: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
};

function buildQuery(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    query.set(key, String(value));
  }
  return query.toString();
}

export async function listPatientConsultations(
  params: ConsultationHistoryQuery,
): Promise<ConsultationHistoryResponse> {
  const query = buildQuery(
    params as Record<string, string | number | undefined>,
  );
  return http<ConsultationHistoryResponse>(
    `${endpoints.consultations.historyPatient}?${query}`,
  );
}

export async function listDoctorPatientConsultations(
  patientUserId: string,
  params: ConsultationHistoryQuery,
): Promise<ConsultationHistoryResponse> {
  const query = buildQuery(
    params as Record<string, string | number | undefined>,
  );
  return http<ConsultationHistoryResponse>(
    `${endpoints.consultations.historyDoctorPatient(patientUserId)}?${query}`,
  );
}

export type ClinicalEpisodeDraft = {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
};

export type ClinicalEpisodeFinal = {
  id: string;
  title: string;
  body?: string;
  formattedBody?: string | null;
  formattedAt?: string | null;
  displayBody?: string;
  createdAt: string;
};

export type ClinicalEpisodeAddendum = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
};

export type ClinicalEpisodeResponse = {
  episodeId: string;
  consultationId: string;
  draft?: ClinicalEpisodeDraft;
  final?: ClinicalEpisodeFinal;
  addendums?: ClinicalEpisodeAddendum[];
};

export async function getClinicalEpisode(
  consultationId: string,
): Promise<ClinicalEpisodeResponse> {
  return http<ClinicalEpisodeResponse>(
    endpoints.consultations.clinicalEpisode(consultationId),
  );
}

export async function putClinicalEpisodeDraft(
  consultationId: string,
  payload: { title: string; body: string },
): Promise<ClinicalEpisodeResponse> {
  return http<ClinicalEpisodeResponse>(
    endpoints.consultations.clinicalEpisode(consultationId) + '/draft',
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
  );
}

export async function postClinicalEpisodeFinalize(
  consultationId: string,
): Promise<ClinicalEpisodeResponse> {
  return http<ClinicalEpisodeResponse>(
    endpoints.consultations.clinicalEpisode(consultationId) + '/finalize',
    {
      method: 'POST',
    },
  );
}

export type SetClinicalEpisodeFormattedPayload = {
  formattedBody: string;
  formatVersion?: number;
  aiMeta?: Record<string, unknown>;
};

export async function putClinicalEpisodeFinalFormatted(
  consultationId: string,
  payload: SetClinicalEpisodeFormattedPayload,
): Promise<ClinicalEpisodeResponse> {
  return http<ClinicalEpisodeResponse>(
    endpoints.consultations.clinicalEpisode(consultationId) +
      '/final/formatted',
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
  );
}

export async function postClinicalEpisodeAddendum(
  consultationId: string,
  payload: { title: string; body: string },
): Promise<ClinicalEpisodeResponse> {
  return http<ClinicalEpisodeResponse>(
    endpoints.consultations.clinicalEpisode(consultationId) + '/addendums',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

// Format Jobs (AI Redaction)
export type FormatJobStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type FormatJobProposal = {
  title?: string | null;
  body: string;
};

export type FormatJobProposals = {
  A?: FormatJobProposal;
  B?: FormatJobProposal;
  C?: FormatJobProposal;
};

export type FormatJobError = {
  code?: string | null;
  message?: string | null;
};

export type FormatJob = {
  id: string;
  status: FormatJobStatus;
  preset: string;
  options?: Record<string, unknown> | null;
  promptVersion: number;
  provider?: string | null;
  model?: string | null;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  proposals?: FormatJobProposals;
  error?: FormatJobError;
};

export type CreateFormatJobPayload = {
  preset?: 'standard' | 'brief' | 'detailed';
  options?: {
    length?: 'short' | 'medium' | 'long';
    bullets?: boolean;
    keywords?: boolean;
    tone?: 'clinical' | 'mixed';
  };
};

export type CreateFormatJobResponse = {
  jobId: string;
  status: FormatJobStatus;
};

export async function createFormatJob(
  consultationId: string,
  payload?: CreateFormatJobPayload,
): Promise<CreateFormatJobResponse> {
  return http<CreateFormatJobResponse>(
    endpoints.consultations.createFormatJob(consultationId),
    {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
    },
  );
}

export async function getFormatJob(jobId: string): Promise<FormatJob> {
  return http<FormatJob>(endpoints.consultations.getFormatJob(jobId));
}
