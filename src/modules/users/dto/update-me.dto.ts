import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateMeDto {
  @ApiPropertyOptional({ example: 'Dra. Maria Lopez' })
  @IsOptional()
  @IsString()
  displayName?: string;
}
