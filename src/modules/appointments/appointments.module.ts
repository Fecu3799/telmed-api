import { Module } from '@nestjs/common';
import { DoctorAvailabilityModule } from '../doctors/availability/doctor-availability.module';
import { PaymentsModule } from '../payments/payments.module';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';

@Module({
  imports: [DoctorAvailabilityModule, PaymentsModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
})
export class AppointmentsModule {}
