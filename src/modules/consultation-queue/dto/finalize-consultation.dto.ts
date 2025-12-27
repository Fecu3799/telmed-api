import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class FinalizeConsultationDto {
  @ApiPropertyOptional({ example: 'Resumen' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary?: string;

  @ApiPropertyOptional({ example: 'Notas' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}
