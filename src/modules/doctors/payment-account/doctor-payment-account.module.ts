import { Module } from '@nestjs/common';
import { DoctorPaymentAccountController } from './doctor-payment-account.controller';
import { DoctorPaymentAccountService } from './doctor-payment-account.service';

/**
 * Doctor payment account module.
 * What it does:
 * - Wires DEV account endpoints under /doctors/me/payment-account.
 */
@Module({
  controllers: [DoctorPaymentAccountController],
  providers: [DoctorPaymentAccountService],
})
export class DoctorPaymentAccountModule {}
