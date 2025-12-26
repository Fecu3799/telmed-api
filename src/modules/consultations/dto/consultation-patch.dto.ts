import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ConsultationPatchDto {
  @ApiPropertyOptional({ example: 'Resumen de la consulta' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary?: string;

  @ApiPropertyOptional({ example: 'Notas internas' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}
