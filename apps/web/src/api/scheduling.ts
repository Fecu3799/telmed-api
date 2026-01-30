import { http } from './http';
import { endpoints } from './endpoints';

export interface AvailabilityRule {
  id: string;
  dayOfWeek: number; // 0-6 (Sunday=0)
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  isActive: boolean;
}

export interface AvailabilityRuleInput {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive?: boolean;
}

export interface AvailabilityRulesPutRequest {
  rules: AvailabilityRuleInput[];
}

export type DoctorAvailabilityExceptionType = 'closed' | 'custom';

export interface AvailabilityWindow {
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}

export interface AvailabilityException {
  id: string;
  date: string; // YYYY-MM-DD
  type: DoctorAvailabilityExceptionType;
  customWindows?: AvailabilityWindow[];
}

export interface AvailabilityExceptionCreateRequest {
  date: string; // YYYY-MM-DD
  type: DoctorAvailabilityExceptionType;
  customWindows?: AvailabilityWindow[];
}

export interface AvailabilityExceptionsQuery {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}

export interface DoctorSchedulingConfig {
  userId: string;
  slotDurationMinutes: number;
  leadTimeHours: number;
  horizonDays: number;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

export interface DoctorSchedulingConfigUpdateRequest {
  slotDurationMinutes: number;
}

/**
 * Get scheduling config for current doctor
 */
export async function getMyDoctorSchedulingConfig(): Promise<DoctorSchedulingConfig> {
  return http<DoctorSchedulingConfig>(endpoints.availability.schedulingConfig);
}

/**
 * Update scheduling config for current doctor
 */
export async function patchMyDoctorSchedulingConfig(
  data: DoctorSchedulingConfigUpdateRequest,
): Promise<DoctorSchedulingConfig> {
  return http<DoctorSchedulingConfig>(endpoints.availability.schedulingConfig, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/**
 * Get availability rules for current doctor
 */
export async function getAvailabilityRules(): Promise<AvailabilityRule[]> {
  return http<AvailabilityRule[]>(endpoints.availability.listRules);
}

/**
 * Replace availability rules for current doctor
 */
export async function updateAvailabilityRules(
  data: AvailabilityRulesPutRequest,
): Promise<AvailabilityRule[]> {
  return http<AvailabilityRule[]>(endpoints.availability.updateRules, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/**
 * List availability exceptions for current doctor
 */
export async function listAvailabilityExceptions(
  query: AvailabilityExceptionsQuery,
): Promise<AvailabilityException[]> {
  const params = new URLSearchParams();
  params.append('from', query.from);
  params.append('to', query.to);
  const url = `${endpoints.availability.listExceptions}?${params.toString()}`;
  return http<AvailabilityException[]>(url);
}

/**
 * Create availability exception for current doctor
 */
export async function createAvailabilityException(
  data: AvailabilityExceptionCreateRequest,
): Promise<AvailabilityException> {
  return http<AvailabilityException>(endpoints.availability.createException, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Delete availability exception for current doctor
 */
export async function deleteAvailabilityException(
  id: string,
): Promise<{ success: boolean }> {
  return http<{ success: boolean }>(
    endpoints.availability.deleteException(id),
    {
      method: 'DELETE',
    },
  );
}
