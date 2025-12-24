import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsISO8601, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class AdminAppointmentsQueryDto {
  @ApiProperty({ example: '2025-01-01T00:00:00.000Z' })
  @IsISO8601()
  from!: string;

  @ApiProperty({ example: '2025-01-31T23:59:59.000Z' })
  @IsISO8601()
  to!: string;

  @ApiPropertyOptional({ example: 'b9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  @IsOptional()
  @IsUUID()
  doctorUserId?: string;

  @ApiPropertyOptional({ example: '2b3c5f7a-9c2a-4c1e-8e9f-123456789abc' })
  @IsOptional()
  @IsUUID()
  patientUserId?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
