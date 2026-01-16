import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EmergencyListItemDto {
  @ApiProperty({ example: 'd9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  id!: string;

  @ApiProperty({ example: 'queued' })
  queueStatus!: string;

  @ApiProperty({ example: 'not_started' })
  paymentStatus!: string;

  @ApiProperty({ example: false })
  canStart!: boolean;

  @ApiProperty({ example: '2025-01-01T12:00:00.000Z' })
  createdAt!: string;

  @ApiPropertyOptional({ example: 'Dolor fuerte' })
  reason?: string | null;

  @ApiPropertyOptional({
    example: {
      id: 'u9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a',
      displayName: 'Ana Perez',
    },
  })
  counterparty?: { id: string; displayName: string | null } | null;

  @ApiPropertyOptional({ example: 'Cardiologia' })
  specialty?: string | null;

  @ApiPropertyOptional({ example: 150000 })
  priceCents?: number | null;

  @ApiPropertyOptional({ example: 'c9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  consultationId?: string | null;
}

export class EmergenciesPageInfoDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: true })
  hasNextPage!: boolean;

  @ApiProperty({ example: false })
  hasPrevPage!: boolean;
}

export class EmergenciesResponseDto {
  @ApiProperty({ type: [EmergencyListItemDto] })
  items!: EmergencyListItemDto[];

  @ApiProperty({ type: EmergenciesPageInfoDto })
  pageInfo!: EmergenciesPageInfoDto;
}
