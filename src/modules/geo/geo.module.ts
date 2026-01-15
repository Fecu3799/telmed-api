import { Module, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConsultationQueueModule } from '../consultation-queue/consultation-queue.module';
import { GeoController } from './geo.controller';
import { GeoEmergencyCoordinator } from './geo-emergency-coordinator.service';
import { GeoService } from './geo.service';
import { SubscriptionPlanResolver } from './subscription-plan-resolver.service';
import { GEO_GEOCODER } from './geo-geocoding.service';
import { NominatimGeoGeocodingProvider } from './nominatim-geo-geocoding.provider';
import { StubGeoGeocodingProvider } from './stub-geo-geocoding.provider';

@Module({
  imports: [forwardRef(() => ConsultationQueueModule)],
  controllers: [GeoController],
  providers: [
    GeoService,
    SubscriptionPlanResolver,
    GeoEmergencyCoordinator,
    NominatimGeoGeocodingProvider,
    StubGeoGeocodingProvider,
    {
      provide: GEO_GEOCODER,
      inject: [
        ConfigService,
        NominatimGeoGeocodingProvider,
        StubGeoGeocodingProvider,
      ],
      useFactory: (
        configService: ConfigService,
        nominatim: NominatimGeoGeocodingProvider,
        stub: StubGeoGeocodingProvider,
      ) => {
        const provider =
          configService.get<string>('GEO_GEOCODER_PROVIDER') ??
          (process.env.NODE_ENV === 'test' ? 'stub' : 'nominatim');
        return provider === 'stub' ? stub : nominatim;
      },
    },
  ],
  exports: [GeoEmergencyCoordinator, GEO_GEOCODER],
})
export class GeoModule {}
