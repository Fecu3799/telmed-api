import { http } from './http';
import { endpoints } from './endpoints';

export interface PatientSummary {
  id: string; // patientUserId
  fullName: string;
  email?: string | null;
  lastInteractionAt: string;
  lastAppointmentAt?: string | null;
  lastConsultationAt?: string | null;
}

export interface PageInfo {
  page: number;
  limit: number;
  total: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface DoctorPatientsResponse {
  items: PatientSummary[];
  pageInfo: PageInfo;
}

export interface ListDoctorPatientsQuery {
  page?: number;
  limit?: number;
  q?: string;
}

/**
 * List patients with clinical contact for current doctor
 * @param query - Query parameters (page, limit, q for search)
 */
export async function listDoctorPatients(
  query?: ListDoctorPatientsQuery,
): Promise<DoctorPatientsResponse> {
  const params = new URLSearchParams();
  if (query?.page) params.append('page', String(query.page));
  if (query?.limit) params.append('limit', String(query.limit));
  if (query?.q) params.append('q', query.q);

  const queryString = params.toString();
  const url = queryString
    ? `${endpoints.doctorPatients.list}?${queryString}`
    : endpoints.doctorPatients.list;

  return http<DoctorPatientsResponse>(url);
}
