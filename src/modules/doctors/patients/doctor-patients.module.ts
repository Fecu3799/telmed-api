import { Module } from '@nestjs/common';
import { DoctorPatientsService } from './doctor-patients.service';
import { DoctorPatientsController } from './doctor-patients.controller';

@Module({
  controllers: [DoctorPatientsController],
  providers: [DoctorPatientsService],
  exports: [DoctorPatientsService],
})
export class DoctorPatientsModule {}
