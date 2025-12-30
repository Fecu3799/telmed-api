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
