import { Module } from '@nestjs/common';
import { DoctorAvailabilityModule } from './availability/doctor-availability.module';
import { DoctorProfilesModule } from './profile/doctor-profiles.module';
import { DoctorSearchModule } from './search/doctor-search.module';
import { DoctorPatientsModule } from './patients/doctor-patients.module';
import { DoctorDashboardModule } from './dashboard/doctor-dashboard.module';
import { DoctorPaymentAccountModule } from './payment-account/doctor-payment-account.module';

@Module({
  imports: [
    DoctorProfilesModule,
    DoctorSearchModule,
    DoctorAvailabilityModule,
    DoctorPatientsModule,
    DoctorDashboardModule,
    DoctorPaymentAccountModule,
  ],
})
export class DoctorsModule {}
