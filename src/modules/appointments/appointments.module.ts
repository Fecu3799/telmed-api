import { Module } from '@nestjs/common';
import { DoctorAvailabilityModule } from '../doctors/availability/doctor-availability.module';
import { PaymentsModule } from '../payments/payments.module';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { PatientsIdentityModule } from '../patients-identity/patients-identity.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    DoctorAvailabilityModule,
    PaymentsModule,
    PatientsIdentityModule,
    NotificationsModule,
  ],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
})
export class AppointmentsModule {}
