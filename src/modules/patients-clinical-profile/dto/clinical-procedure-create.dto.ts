import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsOptional, IsString } from 'class-validator';

export class ClinicalProcedureCreateDto {
  @ApiProperty({ example: 'Appendectomy' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: 'Performed in 2018' })
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
