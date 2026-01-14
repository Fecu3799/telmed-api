import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PatientSummaryDto {
  @ApiProperty({ example: '2b3c5f7a-9c2a-4c1e-8e9f-123456789abc' })
  id!: string; // patientUserId

  @ApiProperty({ example: 'Juan' })
  fullName!: string;

  @ApiPropertyOptional({ example: 'juan.paciente@example.com' })
  email?: string | null;

  @ApiProperty({ example: '2025-01-05T14:00:00.000Z' })
  lastInteractionAt!: string;

  @ApiPropertyOptional({ example: '2025-01-05T14:00:00.000Z' })
  lastAppointmentAt?: string | null;

  @ApiPropertyOptional({ example: '2025-01-05T15:00:00.000Z' })
  lastConsultationAt?: string | null;
}
