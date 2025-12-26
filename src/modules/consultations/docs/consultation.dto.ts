import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConsultationStatus } from '@prisma/client';

export class ConsultationDto {
  @ApiProperty({ example: 'b9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  id!: string;

  @ApiProperty({ example: 'e9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  appointmentId!: string;

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
}
