import { http } from './http';
import { endpoints } from './endpoints';

export interface DoctorSearchSpecialty {
  id: string;
  name: string;
}

export interface DoctorSearchLocation {
  lat: number;
  lng: number;
}

export interface DoctorSearchItem {
  doctorUserId: string;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  priceCents: number;
  currency: string;
  verificationStatus: string;
  location?: DoctorSearchLocation | null;
  distanceMeters?: number | null;
  specialties?: DoctorSearchSpecialty[];
}

export interface DoctorSearchResponse {
  items: DoctorSearchItem[];
  pageInfo: { nextCursor: string | null };
  limit: number;
}

export interface DoctorSearchParams {
  q?: string;
  specialtyId?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  maxPriceCents?: number;
  sort?:
    | 'relevance'
    | 'distance'
    | 'price_asc'
    | 'price_desc'
    | 'name_asc'
    | 'name_desc';
  limit?: number;
  cursor?: string;
  verificationStatus?: string;
}

/**
 * Search doctors
 * @param params - Search parameters
 */
export async function searchDoctors(
  params: DoctorSearchParams,
): Promise<DoctorSearchResponse> {
  const searchParams = new URLSearchParams();
  if (params.q) {
    searchParams.append('q', params.q);
  }
  if (params.specialtyId) {
    searchParams.append('specialtyId', params.specialtyId);
  }
  if (params.lat !== undefined) {
    searchParams.append('lat', String(params.lat));
  }
  if (params.lng !== undefined) {
    searchParams.append('lng', String(params.lng));
  }
  if (params.radiusKm !== undefined) {
    searchParams.append('radiusKm', String(params.radiusKm));
  }
  if (params.maxPriceCents !== undefined) {
    searchParams.append('maxPriceCents', String(params.maxPriceCents));
  }
  if (params.sort) {
    searchParams.append('sort', params.sort);
  }
  if (params.limit !== undefined) {
    searchParams.append('limit', String(params.limit));
  }
  if (params.cursor) {
    searchParams.append('cursor', params.cursor);
  }
  if (params.verificationStatus) {
    searchParams.append('verificationStatus', params.verificationStatus);
  }
  const query = searchParams.toString();
  const url = query
    ? `${endpoints.doctorSearch.search}?${query}`
    : endpoints.doctorSearch.search;
  return http<DoctorSearchResponse>(url);
}
