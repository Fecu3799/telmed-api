import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { PatientFileCategory, PatientFileStatus } from '@prisma/client';

export class ListFilesQueryDto {
  @ApiPropertyOptional({
    example:
      'eyJjcmVhdGVkQXQiOiIyMDI1LTAxLTA1VDE0OjAwOjAwLjAwMFoiLCJpZCI6ImNtOWI3ZjM4Yy0wYzFlLTRjNWQtOGY5Zi0wYzBlNGM3ZTFhMWEifQ==',
    description: 'Cursor for pagination',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    example: 50,
    minimum: 1,
    maximum: 100,
    default: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    example: 'lab',
    enum: PatientFileCategory,
    description: 'Filter by category',
  })
  @IsOptional()
  @IsEnum(PatientFileCategory)
  category?: PatientFileCategory;

  @ApiPropertyOptional({
    example: 'c9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a',
    description: 'Filter by related consultation ID',
  })
  @IsOptional()
  @IsUUID()
  relatedConsultationId?: string;

  @ApiPropertyOptional({
    example: 'informe',
    description: 'Search by original name (case-insensitive partial match)',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    example: 'ready',
    enum: PatientFileStatus,
    default: 'ready',
    description: 'Filter by status (default: ready)',
  })
  @IsOptional()
  @IsEnum(PatientFileStatus)
  status?: PatientFileStatus;
}
