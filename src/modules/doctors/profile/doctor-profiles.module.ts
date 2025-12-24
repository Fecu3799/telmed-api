import { Module } from '@nestjs/common';
import { DoctorProfilesController } from './doctor-profiles.controller';
import { DoctorProfilesService } from './doctor-profiles.service';

@Module({
  controllers: [DoctorProfilesController],
  providers: [DoctorProfilesService],
})
export class DoctorProfilesModule {}
