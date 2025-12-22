import { Module } from '@nestjs/common';
import { DoctorProfilesController } from './doctor-profiles.controller';
import { DoctorProfilesService } from './doctor-profiles.service';
import { DoctorSearchController } from './doctor-search.controller';
import { DoctorSearchService } from './doctor-search.service';

@Module({
  controllers: [DoctorProfilesController, DoctorSearchController],
  providers: [DoctorProfilesService, DoctorSearchService],
})
export class DoctorProfilesModule {}
