import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { LocationDto } from './location.dto';

export class DoctorProfilePatchDto {
  @ApiPropertyOptional({ example: 'Cardiologo con 10 anos de experiencia.' })
  @IsOptional()
  @IsString()
  bio?: string | null;

  @ApiPropertyOptional({ example: 150000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  priceCents?: number;

  @ApiPropertyOptional({ example: 'ARS' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ type: LocationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDto)
  location?: LocationDto;
}
