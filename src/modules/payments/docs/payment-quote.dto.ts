import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentKind } from '@prisma/client';

export class PaymentQuoteDto {
  @ApiProperty({ enum: PaymentKind, example: PaymentKind.appointment })
  kind!: PaymentKind;

  @ApiProperty({ example: 'c4b4c1d2-5b77-4c1f-9b6c-78e7a2e8b1d1' })
  referenceId!: string;

  @ApiProperty({ example: 'f2c94ef0-1c4a-4e53-b2cc-6aab2e88a917' })
  doctorUserId!: string;

  @ApiProperty({ example: 120000 })
  grossCents!: number;

  @ApiProperty({ example: 18000 })
  platformFeeCents!: number;

  @ApiProperty({ example: 138000 })
  totalChargedCents!: number;

  @ApiProperty({ example: 'ARS' })
  currency!: string;

  @ApiPropertyOptional({ example: 'Dra. Ana Test', nullable: true })
  doctorDisplayName?: string | null;
}
