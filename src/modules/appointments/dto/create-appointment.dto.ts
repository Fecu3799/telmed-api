import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class CreateAppointmentDto {
  @ApiProperty({ example: 'b9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  @IsUUID()
  doctorUserId!: string;

  @ApiPropertyOptional({ example: '2b3c5f7a-9c2a-4c1e-8e9f-123456789abc' })
  @IsOptional()
  @IsUUID()
  patientUserId?: string;

  @ApiProperty({ example: '2025-01-05T14:00:00.000Z' })
  @IsISO8601()
  startAt!: string;

  @ApiPropertyOptional({ example: 'Dolor agudo en el pecho' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  reason?: string;
}
