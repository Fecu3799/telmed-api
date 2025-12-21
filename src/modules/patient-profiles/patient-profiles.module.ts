import { Module } from '@nestjs/common';
import { PatientProfilesController } from './patient-profiles.controller';
import { PatientProfilesService } from './patient-profiles.service';

@Module({
  controllers: [PatientProfilesController],
  providers: [PatientProfilesService],
})
export class PatientProfilesModule {}
