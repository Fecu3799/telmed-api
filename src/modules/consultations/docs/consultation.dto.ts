import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConsultationStatus } from '@prisma/client';

class ConsultationQueueSummaryDto {
  @ApiProperty({ example: 'q9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  id!: string;

  @ApiProperty({ example: 'emergency' })
  entryType!: string;

  @ApiPropertyOptional({ example: 'Dolor agudo' })
  reason?: string | null;

  @ApiPropertyOptional({ example: 'paid' })
  paymentStatus?: string | null;

  @ApiPropertyOptional({ example: 'e9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  appointmentId?: string | null;
}

export class ConsultationDto {
  @ApiProperty({ example: 'b9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  id!: string;

  @ApiPropertyOptional({
    example: 'e9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a',
    nullable: true,
  })
  appointmentId?: string | null;

  @ApiPropertyOptional({
    example: 'q9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a',
    nullable: true,
  })
  queueItemId?: string | null;

  @ApiProperty({ example: 'd9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  doctorUserId!: string;

  @ApiProperty({ example: '2b3c5f7a-9c2a-4c1e-8e9f-123456789abc' })
  patientUserId!: string;

  @ApiProperty({ example: 'draft', enum: ConsultationStatus })
  status!: ConsultationStatus;

  @ApiPropertyOptional({ example: '2025-01-05T14:00:00.000Z' })
  startedAt?: string | null;

  @ApiPropertyOptional({ example: '2025-01-05T15:00:00.000Z' })
  closedAt?: string | null;

  @ApiPropertyOptional({ example: 'Resumen de la consulta' })
  summary?: string | null;

  @ApiPropertyOptional({ example: 'Notas internas' })
  notes?: string | null;

  @ApiProperty({ example: '2025-01-01T12:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2025-01-02T12:00:00.000Z' })
  updatedAt!: string;

  @ApiPropertyOptional({ type: ConsultationQueueSummaryDto, nullable: true })
  queueItem?: ConsultationQueueSummaryDto | null;

  @ApiPropertyOptional({
    example:
      'https://video.telmed.local/consultations/b9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a',
  })
  videoUrl?: string | null;
}
