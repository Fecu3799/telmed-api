import { http } from './http';
import { endpoints } from './endpoints';

export interface ConsultationInfo {
  id: string;
  status: 'draft' | 'in_progress' | 'closed';
  startedAt?: string | null;
  closedAt?: string | null;
}

export type EmergencyItem = {
  id: string;
  queueStatus: string;
  paymentStatus: string;
  canStart: boolean;
  createdAt: string;
  reason?: string | null;
  counterparty?: { id: string; displayName: string | null } | null;
  specialty?: string | null;
  priceCents?: number | null;
  consultation?: ConsultationInfo | null;
};

export type EmergenciesResponse = {
  items: EmergencyItem[];
  pageInfo: {
    page: number;
    pageSize: number;
    total: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
};

type EmergenciesQuery = {
  page?: number;
  pageSize?: number;
  status?: string;
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

export async function listDoctorEmergencies(
  params: EmergenciesQuery,
): Promise<EmergenciesResponse> {
  const query = buildQuery(
    params as Record<string, string | number | undefined>,
  );
  return http<EmergenciesResponse>(`${endpoints.emergencies.doctor}?${query}`);
}

export async function listPatientEmergencies(
  params: EmergenciesQuery,
): Promise<EmergenciesResponse> {
  const query = buildQuery(
    params as Record<string, string | number | undefined>,
  );
  return http<EmergenciesResponse>(`${endpoints.emergencies.patient}?${query}`);
}
