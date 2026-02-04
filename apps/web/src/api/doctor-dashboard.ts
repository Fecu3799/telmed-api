import { http } from './http';
import { endpoints } from './endpoints';

export type DashboardRange = '7d' | '30d' | 'ytd';
export type PaymentStatus =
  | 'paid'
  | 'pending'
  | 'failed'
  | 'expired'
  | 'cancelled'
  | 'refunded';

export interface DoctorDashboardOverview {
  range: DashboardRange;
  currency: string;
  kpis: {
    grossEarningsCents: number;
    platformFeesCents: number;
    totalChargedCents: number;
    paidPaymentsCount: number;
    uniquePatientsCount: number;
  };
}

export interface DoctorPaymentItem {
  id: string;
  status: PaymentStatus;
  grossAmountCents: number;
  platformFeeCents: number;
  totalChargedCents: number;
  currency: string;
  createdAt: string;
  paidAt?: string | null;
  kind: 'appointment' | 'emergency';
  appointmentId?: string | null;
  queueItemId?: string | null;
  patient?: { id: string; displayName?: string | null } | null;
}

export interface DoctorPaymentsResponse {
  items: DoctorPaymentItem[];
  pageInfo: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export async function getDoctorDashboardOverview(
  range: DashboardRange,
): Promise<DoctorDashboardOverview> {
  const params = new URLSearchParams({ range });
  return http<DoctorDashboardOverview>(
    `${endpoints.doctorDashboard.overview}?${params.toString()}`,
  );
}

export async function listDoctorPayments(params: {
  page?: number;
  pageSize?: number;
  range?: DashboardRange;
  status?: PaymentStatus;
}): Promise<DoctorPaymentsResponse> {
  const search = new URLSearchParams();
  if (params.page) search.set('page', String(params.page));
  if (params.pageSize) search.set('pageSize', String(params.pageSize));
  if (params.range) search.set('range', params.range);
  if (params.status) search.set('status', params.status);

  const suffix = search.toString();
  const endpoint = suffix
    ? `${endpoints.doctorDashboard.payments}?${suffix}`
    : endpoints.doctorDashboard.payments;

  return http<DoctorPaymentsResponse>(endpoint);
}
