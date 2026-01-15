export type GeoAddress = {
  city: string | null;
  region: string | null;
  countryCode: string | null;
};

export interface GeoGeocodingService {
  reverseGeocode(lat: number, lng: number): Promise<GeoAddress | null>;
}

export const GEO_GEOCODER = 'GEO_GEOCODER';
