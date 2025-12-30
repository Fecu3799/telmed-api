import { ApiProperty } from '@nestjs/swagger';
import { PaymentCheckoutDto } from '../../payments/docs/payment.dto';
import { AppointmentDto } from './appointment.dto';

export class AppointmentWithPaymentDto {
  @ApiProperty({ type: AppointmentDto })
  appointment!: AppointmentDto;

  @ApiProperty({ type: PaymentCheckoutDto })
  payment!: PaymentCheckoutDto;
}
