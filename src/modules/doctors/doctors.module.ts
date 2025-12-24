import { Module } from '@nestjs/common';
import { DoctorAvailabilityModule } from './availability/doctor-availability.module';
import { DoctorProfilesModule } from './profile/doctor-profiles.module';
import { DoctorSearchModule } from './search/doctor-search.module';

@Module({
  imports: [DoctorProfilesModule, DoctorSearchModule, DoctorAvailabilityModule],
})
export class DoctorsModule {}
