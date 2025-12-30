import { Module } from '@nestjs/common';
import { PaymentsModule } from '../../payments/payments.module';
import { DoctorAvailabilityController } from './doctor-availability.controller';
import { DoctorAvailabilityService } from './doctor-availability.service';

@Module({
  controllers: [DoctorAvailabilityController],
  imports: [PaymentsModule],
  providers: [DoctorAvailabilityService],
  exports: [DoctorAvailabilityService],
})
export class DoctorAvailabilityModule {}
