import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConsultationStatus } from '@prisma/client';

/**
 * Consultation history response DTOs.
 * What it does:
 * - Documents the response shape for paginated consultation history listings.
 * How it works:
 * - Exposes consultation status and participants with ISO date fields.
 * Gotchas:
 * - startedAt/closedAt can be null for drafts or in-progress consultations.
 */
export class ConsultationHistoryParticipantDto {
  @ApiProperty({ example: '2b3c5f7a-9c2a-4c1e-8e9f-123456789abc' })
  id!: string;

  @ApiProperty({ example: 'Dra. Ana Gomez' })
  displayName!: string;
}

export class ConsultationHistoryItemDto {
  @ApiProperty({ example: 'b9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  id!: string;

  @ApiProperty({ example: 'draft', enum: ConsultationStatus })
  status!: ConsultationStatus;

  @ApiProperty({ example: '2025-01-01T12:00:00.000Z' })
  createdAt!: string;

  @ApiPropertyOptional({ example: '2025-01-01T12:10:00.000Z', nullable: true })
  startedAt?: string | null;

  @ApiPropertyOptional({ example: '2025-01-01T12:30:00.000Z', nullable: true })
  closedAt?: string | null;

  @ApiProperty({ type: ConsultationHistoryParticipantDto })
  doctor!: ConsultationHistoryParticipantDto;

  @ApiPropertyOptional({ type: ConsultationHistoryParticipantDto })
  patient?: ConsultationHistoryParticipantDto;

  @ApiPropertyOptional({ example: true })
  hasClinicalFinal?: boolean;
}

export class ConsultationHistoryPageInfoDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;

  @ApiProperty({ example: 5 })
  totalItems!: number;

  @ApiProperty({ example: 1 })
  totalPages!: number;

  @ApiProperty({ example: false })
  hasNextPage!: boolean;

  @ApiProperty({ example: false })
  hasPrevPage!: boolean;
}

export class ConsultationHistoryResponseDto {
  @ApiProperty({ type: [ConsultationHistoryItemDto] })
  items!: ConsultationHistoryItemDto[];

  @ApiProperty({ type: ConsultationHistoryPageInfoDto })
  pageInfo!: ConsultationHistoryPageInfoDto;
}
