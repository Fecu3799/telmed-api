import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentKind } from '@prisma/client';
import { IsEnum, IsUUID, ValidateIf } from 'class-validator';

export class PaymentQuoteRequestDto {
  @ApiProperty({ enum: PaymentKind, example: PaymentKind.appointment })
  @IsEnum(PaymentKind)
  kind!: PaymentKind;

  @ApiPropertyOptional({ example: 'c4b4c1d2-5b77-4c1f-9b6c-78e7a2e8b1d1' })
  @ValidateIf((value) => value.kind === PaymentKind.appointment)
  @IsUUID()
  appointmentId?: string;

  @ApiPropertyOptional({ example: 'a3b4c1d2-5b77-4c1f-9b6c-78e7a2e8b1d1' })
  @ValidateIf((value) => value.kind === PaymentKind.emergency)
  @IsUUID()
  queueItemId?: string;
}
