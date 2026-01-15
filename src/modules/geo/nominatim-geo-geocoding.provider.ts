import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { GeoAddress, GeoGeocodingService } from './geo-geocoding.service';

type NominatimResponse = {
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    hamlet?: string;
    state?: string;
    region?: string;
    county?: string;
    country_code?: string;
  };
};

@Injectable()
export class NominatimGeoGeocodingProvider implements GeoGeocodingService {
  private readonly logger = new Logger(NominatimGeoGeocodingProvider.name);
  private readonly timeoutMs: number;
  private readonly userAgent: string;
  private readonly baseUrl = 'https://nominatim.openstreetmap.org/reverse';

  constructor(configService: ConfigService) {
    this.timeoutMs = Number(
      configService.get('GEO_GEOCODER_TIMEOUT_MS') ?? 2500,
    );
    this.userAgent = String(
      configService.get('GEO_GEOCODER_USER_AGENT') ?? 'telmed-api',
    );
  }

  async reverseGeocode(lat: number, lng: number): Promise<GeoAddress | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const url = new URL(this.baseUrl);
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('lat', String(lat));
      url.searchParams.set('lon', String(lng));
      url.searchParams.set('addressdetails', '1');

      const response = await fetch(url.toString(), {
        headers: {
          'User-Agent': this.userAgent,
          'Accept-Language': 'es',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.warn(
          JSON.stringify({
            event: 'geo_reverse_geocode_failed',
            status: response.status,
          }),
        );
        return null;
      }

      const payload = (await response.json()) as NominatimResponse;
      const address = payload.address ?? {};

      const city =
        address.city ??
        address.town ??
        address.village ??
        address.municipality ??
        address.hamlet ??
        null;
      const region = address.state ?? address.region ?? address.county ?? null;
      const countryCode = address.country_code
        ? address.country_code.toUpperCase()
        : null;

      if (!city && !region && !countryCode) {
        return null;
      }

      return { city, region, countryCode };
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'geo_reverse_geocode_error',
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
