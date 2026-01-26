import { Module } from '@nestjs/common';
import { ConsultationsModule } from '../../consultations/consultations.module';
import { DoctorPatientsService } from './doctor-patients.service';
import { DoctorPatientsController } from './doctor-patients.controller';
import { DoctorPatientConsultationsController } from './doctor-patient-consultations.controller';

/**
 * Doctor patients module wiring.
 * What it does:
 * - Wires doctor-patient listings and consultation history endpoints.
 * How it works:
 * - Imports ConsultationsModule to reuse list history logic.
 * Gotchas:
 * - The history endpoint intentionally returns empty lists for non-related patients.
 */
@Module({
  imports: [ConsultationsModule],
  controllers: [DoctorPatientsController, DoctorPatientConsultationsController],
  providers: [DoctorPatientsService],
  exports: [DoctorPatientsService],
})
export class DoctorPatientsModule {}
