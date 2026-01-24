import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsOptional, IsString } from 'class-validator';

export class ClinicalConditionPatchDto {
  @ApiPropertyOptional({ example: 'Hypertension' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Diagnosed in 2021' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  notes?: string | null;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: '2025-01-05T13:50:00.000Z' })
  @IsOptional()
  @IsDateString()
  endedAt?: string | null;
}
