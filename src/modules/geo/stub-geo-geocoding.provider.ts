import { Injectable } from '@nestjs/common';
import type { GeoAddress, GeoGeocodingService } from './geo-geocoding.service';

@Injectable()
export class StubGeoGeocodingProvider implements GeoGeocodingService {
  reverseGeocode(): Promise<GeoAddress> {
    // Stubbed response for tests/CI (no external requests).
    return Promise.resolve({
      city: 'Test City',
      region: 'Test Region',
      countryCode: 'AR',
    });
  }
}
