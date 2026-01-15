import { http } from './http';
import { endpoints } from './endpoints';

export interface DoctorProfile {
  userId: string;
  firstName: string;
  lastName: string;
  bio: string | null;
  priceCents: number;
  currency: string;
  location: {
    lat: number;
    lng: number;
  } | null;
  city?: string | null;
  region?: string | null;
  countryCode?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DoctorProfilePut {
  firstName: string;
  lastName: string;
  bio?: string | null;
  priceCents: number;
  currency?: string;
  location?: {
    lat: number;
    lng: number;
  } | null;
}

export async function getDoctorProfile(): Promise<DoctorProfile> {
  return http<DoctorProfile>(endpoints.doctorProfile.get);
}

export async function putDoctorProfile(
  data: DoctorProfilePut,
): Promise<DoctorProfile> {
  return http<DoctorProfile>(endpoints.doctorProfile.put, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}
