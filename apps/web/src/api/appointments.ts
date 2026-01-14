import { http } from './http';
import { endpoints } from './endpoints';

export interface AvailabilitySlot {
  startAt: string;
  endAt: string;
}

export interface AvailabilityMeta {
  timezone: string;
  slotDurationMinutes: number;
  leadTimeHours: number;
  horizonDays: number;
}

export interface AvailabilityResponse {
  items: AvailabilitySlot[];
  meta: AvailabilityMeta;
}

export interface Appointment {
  id: string;
  doctorUserId: string;
  patientUserId: string;
  startAt: string;
  endAt: string;
  status: 'pending_payment' | 'scheduled' | 'cancelled';
  reason?: string | null;
  createdAt: string;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  paymentExpiresAt?: string | null;
}

export interface PaymentCheckout {
  id: string;
  checkoutUrl: string;
  expiresAt: string;
  status: string;
}

export interface AppointmentWithPayment {
  appointment: Appointment;
  payment: PaymentCheckout;
}

export interface AppointmentsPageInfo {
  page: number;
  limit: number;
  total: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface AppointmentsResponse {
  items: Appointment[];
  pageInfo: AppointmentsPageInfo;
}

export interface CreateAppointmentRequest {
  doctorUserId: string;
  startAt: string;
}

export interface CancelAppointmentRequest {
  reason?: string;
}

/**
 * Get public availability slots for a doctor
 * @param doctorUserId - The doctor's user ID
 * @param from - Start date/time in ISO UTC (e.g., "2025-01-05T00:00:00.000Z")
 * @param to - End date/time in ISO UTC (e.g., "2025-01-06T00:00:00.000Z")
 */
export async function getDoctorAvailability(
  doctorUserId: string,
  from: string,
  to: string,
): Promise<AvailabilityResponse> {
  const params = new URLSearchParams();
  params.append('from', from);
  params.append('to', to);
  const url = `${endpoints.doctorAvailability.get(doctorUserId)}?${params.toString()}`;
  return http<AvailabilityResponse>(url);
}

/**
 * Create an appointment (patient)
 * @param data - Appointment data with doctorUserId and startAt
 */
export async function createAppointment(
  data: CreateAppointmentRequest,
): Promise<AppointmentWithPayment> {
  return http<AppointmentWithPayment>(endpoints.appointments.create, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * List appointments for current patient
 * @param from - Start date/time in ISO UTC (required)
 * @param to - End date/time in ISO UTC (required)
 * @param page - Page number (1-based, default: 1)
 * @param limit - Items per page (default: 20)
 */
export async function listPatientAppointments(
  from: string,
  to: string,
  page = 1,
  limit = 20,
): Promise<AppointmentsResponse> {
  const params = new URLSearchParams();
  params.append('from', from);
  params.append('to', to);
  params.append('page', String(page));
  params.append('limit', String(limit));
  const url = `${endpoints.appointments.listPatient}?${params.toString()}`;
  return http<AppointmentsResponse>(url);
}

/**
 * List appointments for current doctor
 * @param from - Start date/time in ISO UTC (required)
 * @param to - End date/time in ISO UTC (required)
 * @param page - Page number (1-based, default: 1)
 * @param limit - Items per page (default: 20)
 */
export async function listDoctorAppointments(
  from: string,
  to: string,
  page = 1,
  limit = 20,
): Promise<AppointmentsResponse> {
  const params = new URLSearchParams();
  params.append('from', from);
  params.append('to', to);
  params.append('page', String(page));
  params.append('limit', String(limit));
  const url = `${endpoints.appointments.listDoctor}?${params.toString()}`;
  return http<AppointmentsResponse>(url);
}

/**
 * Request payment checkout for an appointment
 * @param appointmentId - The appointment ID
 * @param idempotencyKey - Optional idempotency key for deduplication
 */
export async function payAppointment(
  appointmentId: string,
  idempotencyKey?: string,
): Promise<PaymentCheckout> {
  const headers: Record<string, string> = {};
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }
  return http<PaymentCheckout>(endpoints.appointments.pay(appointmentId), {
    method: 'POST',
    headers,
  });
}

/**
 * Cancel an appointment
 * @param appointmentId - The appointment ID
 * @param reason - Optional cancellation reason
 */
export async function cancelAppointment(
  appointmentId: string,
  reason?: string,
): Promise<Appointment> {
  return http<Appointment>(endpoints.appointments.cancel(appointmentId), {
    method: 'POST',
    body: JSON.stringify({ reason: reason || undefined }),
  });
}
