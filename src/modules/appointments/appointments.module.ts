import { Module } from '@nestjs/common';
import { DoctorAvailabilityModule } from '../doctors/availability/doctor-availability.module';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';

@Module({
  imports: [DoctorAvailabilityModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
})
export class AppointmentsModule {}
