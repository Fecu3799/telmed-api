import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectQueueDto {
  @ApiPropertyOptional({ example: 'No disponible' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
