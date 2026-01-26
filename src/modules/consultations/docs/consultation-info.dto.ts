import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConsultationStatus } from '@prisma/client';

/**
 * Consultation info embedded in appointment/emergency listings.
 * What it does:
 * - Provides minimal consultation status and timing for list views.
 * How it works:
 * - Includes only id, status, startedAt, and closedAt to avoid N+1 queries.
 * Gotchas:
 * - This is a subset of ConsultationDto; full consultation details require GET /consultations/:id.
 */
export class ConsultationInfoDto {
  @ApiProperty({ example: 'b9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  id!: string;

  @ApiProperty({ example: 'in_progress', enum: ConsultationStatus })
  status!: ConsultationStatus;

  @ApiPropertyOptional({ example: '2025-01-05T14:00:00.000Z', nullable: true })
  startedAt?: string | null;

  @ApiPropertyOptional({ example: '2025-01-05T15:00:00.000Z', nullable: true })
  closedAt?: string | null;
}
