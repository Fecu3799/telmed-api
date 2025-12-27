import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ConsultationQueueItemDto {
  @ApiProperty({ example: 'q9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  id!: string;

  @ApiProperty({ example: 'queued' })
  status!: string;

  @ApiProperty({ example: '2025-01-05T13:50:00.000Z' })
  queuedAt!: string;

  @ApiPropertyOptional({ example: '2025-01-05T13:52:00.000Z' })
  acceptedAt?: string | null;

  @ApiPropertyOptional({ example: '2025-01-05T13:55:00.000Z' })
  cancelledAt?: string | null;

  @ApiPropertyOptional({ example: '2025-01-05T13:56:00.000Z' })
  rejectedAt?: string | null;

  @ApiProperty({ example: '2025-01-05T14:05:00.000Z' })
  expiresAt!: string;

  @ApiPropertyOptional({ example: 'e9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  appointmentId?: string | null;

  @ApiProperty({ example: 'd9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  doctorUserId!: string;

  @ApiProperty({ example: '2b3c5f7a-9c2a-4c1e-8e9f-123456789abc' })
  patientUserId!: string;

  @ApiProperty({ example: '2b3c5f7a-9c2a-4c1e-8e9f-123456789abc' })
  createdBy!: string;

  @ApiPropertyOptional({ example: 'd9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  acceptedBy?: string | null;

  @ApiPropertyOptional({ example: 'd9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  cancelledBy?: string | null;

  @ApiPropertyOptional({ example: 'No disponible' })
  reason?: string | null;
}

export class ConsultationDto {
  @ApiProperty({ example: 'c9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  id!: string;

  @ApiProperty({ example: 'draft' })
  status!: string;

  @ApiPropertyOptional({ example: '2025-01-05T14:00:00.000Z' })
  startedAt?: string | null;

  @ApiPropertyOptional({ example: '2025-01-05T14:30:00.000Z' })
  endedAt?: string | null;

  @ApiPropertyOptional({ example: 'e9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  appointmentId?: string | null;

  @ApiProperty({ example: 'd9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  doctorUserId!: string;

  @ApiProperty({ example: '2b3c5f7a-9c2a-4c1e-8e9f-123456789abc' })
  patientUserId!: string;
}
