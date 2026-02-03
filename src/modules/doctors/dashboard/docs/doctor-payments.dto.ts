import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DoctorPaymentPatientDto {
  @ApiProperty({ example: 'u9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  id!: string;

  @ApiPropertyOptional({ example: 'Ana Perez' })
  displayName?: string | null;
}

export class DoctorPaymentListItemDto {
  @ApiProperty({ example: 'p9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  id!: string;

  @ApiProperty({ example: 'paid' })
  status!: string;

  @ApiProperty({ example: 120000 })
  grossAmountCents!: number;

  @ApiProperty({ example: 18000 })
  platformFeeCents!: number;

  @ApiProperty({ example: 138000 })
  totalChargedCents!: number;

  @ApiProperty({ example: 'ARS' })
  currency!: string;

  @ApiProperty({ example: '2025-01-10T12:00:00.000Z' })
  createdAt!: string;

  @ApiPropertyOptional({ example: '2025-01-10T12:05:00.000Z' })
  paidAt?: string | null;

  @ApiProperty({ example: 'appointment' })
  kind!: string;

  @ApiPropertyOptional({ example: 'a9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  appointmentId?: string | null;

  @ApiPropertyOptional({ example: 'q9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  queueItemId?: string | null;

  @ApiPropertyOptional({ type: DoctorPaymentPatientDto })
  patient?: DoctorPaymentPatientDto | null;
}

export class DoctorPaymentsPageInfoDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;

  @ApiProperty({ example: 42 })
  totalItems!: number;

  @ApiProperty({ example: 3 })
  totalPages!: number;

  @ApiProperty({ example: true })
  hasNextPage!: boolean;

  @ApiProperty({ example: false })
  hasPrevPage!: boolean;
}

export class DoctorPaymentsResponseDto {
  @ApiProperty({ type: [DoctorPaymentListItemDto] })
  items!: DoctorPaymentListItemDto[];

  @ApiProperty({ type: DoctorPaymentsPageInfoDto })
  pageInfo!: DoctorPaymentsPageInfoDto;
}
