import { ApiPropertyOptional } from '@nestjs/swagger';
import { ConsultationStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

/**
 * Consultation history query inputs.
 * What it does:
 * - Validates pagination and filter inputs for consultation history listings.
 * How it works:
 * - Uses class-transformer to coerce numeric fields and class-validator for enums/dates.
 * Gotchas:
 * - from/to must be provided together; the service enforces this rule.
 */
export class ConsultationHistoryQueryDto {
  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;

  @ApiPropertyOptional({ enum: ConsultationStatus })
  @IsOptional()
  @IsEnum(ConsultationStatus)
  status?: ConsultationStatus;

  @ApiPropertyOptional({ example: '2025-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ example: '2025-01-31T23:59:59.000Z' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}
