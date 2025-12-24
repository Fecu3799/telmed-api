import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DoctorAvailabilityExceptionType } from '@prisma/client';
import { AvailabilityWindowDto } from '../dto/availability-window.dto';

export class AvailabilityExceptionDto {
  @ApiProperty({ example: 'b9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  id!: string;

  @ApiProperty({ example: '2025-01-15' })
  date!: string;

  @ApiProperty({ example: 'closed', enum: DoctorAvailabilityExceptionType })
  type!: DoctorAvailabilityExceptionType;

  @ApiPropertyOptional({ type: [AvailabilityWindowDto] })
  customWindows?: AvailabilityWindowDto[];
}
