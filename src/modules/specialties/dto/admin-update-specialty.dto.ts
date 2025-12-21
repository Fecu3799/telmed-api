import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class AdminUpdateSpecialtyDto {
  @ApiPropertyOptional({ example: 'Cardiologia' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
