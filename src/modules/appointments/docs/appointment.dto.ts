import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AppointmentStatus } from '@prisma/client';

export class AppointmentDto {
  @ApiProperty({ example: 'b9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  id!: string;

  @ApiProperty({ example: 'd9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  doctorUserId!: string;

  @ApiProperty({ example: '2b3c5f7a-9c2a-4c1e-8e9f-123456789abc' })
  patientUserId!: string;

  @ApiProperty({ example: '2025-01-05T14:00:00.000Z' })
  startAt!: string;

  @ApiProperty({ example: '2025-01-05T14:20:00.000Z' })
  endAt!: string;

  @ApiProperty({ example: 'pending_payment', enum: AppointmentStatus })
  status!: AppointmentStatus;

  @ApiProperty({ example: '2025-01-01T12:00:00.000Z' })
  createdAt!: string;

  @ApiPropertyOptional({ example: '2025-01-02T12:00:00.000Z' })
  cancelledAt?: string | null;

  @ApiPropertyOptional({ example: 'No puedo asistir' })
  cancellationReason?: string | null;

  @ApiPropertyOptional({ example: '2025-01-05T14:10:00.000Z' })
  paymentExpiresAt?: string | null;
}
