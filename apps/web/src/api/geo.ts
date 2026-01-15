import { http } from './http';
import { endpoints } from './endpoints';
import type { DoctorProfile } from './doctor-profile';

export type GeoPresenceResponse = {
  status: 'online';
  ttlSeconds: number;
};

export type GeoPresenceOfflineResponse = {
  success: boolean;
};

export type GeoNearbyDoctor = {
  doctorUserId: string;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  priceCents: number;
  currency: string;
  verificationStatus: string;
  distanceMeters: number;
  city?: string | null;
  region?: string | null;
  countryCode?: string | null;
  specialties: Array<{ id: string; name: string }>;
};

export type GeoNearbyResponse = {
  items: GeoNearbyDoctor[];
  pageInfo: {
    page: number;
    pageSize: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
};

export type GeoNearbyParams = {
  lat: number;
  lng: number;
  radiusMeters: number;
  specialtyId?: string;
  maxPriceCents?: number;
  page?: number;
  pageSize?: number;
};

export type GeoEmergencyCreate = {
  doctorIds: string[];
  patientLocation: { lat: number; lng: number };
  note?: string;
};

export type GeoEmergencyResponse = {
  groupId: string;
  requests: Array<{ doctorId: string; queueItemId: string }>;
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

export async function setDoctorLocation(data: {
  lat: number;
  lng: number;
}): Promise<DoctorProfile> {
  return http<DoctorProfile>(endpoints.doctorProfile.location, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function goOnline(): Promise<GeoPresenceResponse> {
  return http<GeoPresenceResponse>(endpoints.geo.online, { method: 'POST' });
}

export async function pingOnline(): Promise<GeoPresenceResponse> {
  return http<GeoPresenceResponse>(endpoints.geo.ping, { method: 'POST' });
}

export async function goOffline(): Promise<GeoPresenceOfflineResponse> {
  return http<GeoPresenceOfflineResponse>(endpoints.geo.offline, {
    method: 'POST',
  });
}

export async function getNearbyDoctors(
  params: GeoNearbyParams,
): Promise<GeoNearbyResponse> {
  const query = buildQuery(
    params as Record<string, string | number | undefined>,
  );
  return http<GeoNearbyResponse>(`${endpoints.geo.nearby}?${query}`);
}

export async function createGeoEmergency(
  payload: GeoEmergencyCreate,
): Promise<GeoEmergencyResponse> {
  return http<GeoEmergencyResponse>(endpoints.geo.emergencies, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
