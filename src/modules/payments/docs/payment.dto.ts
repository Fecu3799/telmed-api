import { ApiProperty } from '@nestjs/swagger';

export class PaymentCheckoutDto {
  @ApiProperty({ example: 'pay_9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  id!: string;

  @ApiProperty({ example: 'https://www.mercadopago.com/init-point' })
  checkoutUrl!: string;

  @ApiProperty({ example: '2025-01-05T14:05:00.000Z' })
  expiresAt!: string;

  @ApiProperty({ example: 'pending' })
  status!: string;
}

export class PaymentDetailDto {
  @ApiProperty({ example: 'pay_9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  id!: string;

  @ApiProperty({ example: 'mercadopago' })
  provider!: string;

  @ApiProperty({ example: 'appointment' })
  kind!: string;

  @ApiProperty({ example: 'pending' })
  status!: string;

  @ApiProperty({ example: 1200 })
  amountCents!: number;

  @ApiProperty({ example: 'ARS' })
  currency!: string;

  @ApiProperty({ example: 'd9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  doctorUserId!: string;

  @ApiProperty({ example: '2b3c5f7a-9c2a-4c1e-8e9f-123456789abc' })
  patientUserId!: string;

  @ApiProperty({
    example: 'e9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a',
    nullable: true,
  })
  appointmentId?: string | null;

  @ApiProperty({
    example: 'q9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a',
    nullable: true,
  })
  queueItemId?: string | null;

  @ApiProperty({ example: 'https://www.mercadopago.com/init-point' })
  checkoutUrl!: string;

  @ApiProperty({ example: 'pref_123456' })
  providerPreferenceId!: string;

  @ApiProperty({ example: '1234567890', nullable: true })
  providerPaymentId?: string | null;

  @ApiProperty({ example: '2025-01-05T14:05:00.000Z' })
  expiresAt!: string;

  @ApiProperty({ example: '2025-01-05T14:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2025-01-05T14:02:00.000Z' })
  updatedAt!: string;
}
