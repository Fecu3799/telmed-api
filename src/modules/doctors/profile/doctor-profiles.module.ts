import { Module } from '@nestjs/common';
import { GeoModule } from '../../geo/geo.module';
import { DoctorProfilesController } from './doctor-profiles.controller';
import { DoctorProfilesService } from './doctor-profiles.service';

@Module({
  imports: [GeoModule],
  controllers: [DoctorProfilesController],
  providers: [DoctorProfilesService],
})
export class DoctorProfilesModule {}
