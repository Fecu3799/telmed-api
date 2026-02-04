import { http } from './http';
import { endpoints } from './endpoints';

export interface DoctorSpecialty {
  id: string;
  name: string;
}

export interface DoctorSpecialtyOption {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
}

export interface DoctorSpecialtiesResponse {
  specialties: DoctorSpecialty[];
  all?: DoctorSpecialtyOption[];
  selectedIds?: string[];
}

export async function getDoctorSpecialties(): Promise<DoctorSpecialtiesResponse> {
  return http<DoctorSpecialtiesResponse>(endpoints.doctorProfile.specialties);
}

export async function updateDoctorSpecialties(
  specialtyIds: string[],
): Promise<DoctorSpecialtiesResponse> {
  return http<DoctorSpecialtiesResponse>(endpoints.doctorProfile.specialties, {
    method: 'PUT',
    body: JSON.stringify({ specialtyIds }),
  });
}
