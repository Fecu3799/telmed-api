import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelQueueDto {
  @ApiPropertyOptional({ example: 'No puedo asistir' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
