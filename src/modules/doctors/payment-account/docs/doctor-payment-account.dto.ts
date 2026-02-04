import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DoctorPaymentAccountDto {
  @ApiProperty({ example: 'mercadopago' })
  provider!: string;

  @ApiProperty({ example: 'dev' })
  mode!: string;

  @ApiProperty({ example: 'connected' })
  status!: string;

  @ApiPropertyOptional({ example: 'mp-dev-seller-1' })
  devLabel?: string | null;

  @ApiPropertyOptional({ example: '2025-01-01T12:00:00.000Z' })
  updatedAt?: string | null;
}
