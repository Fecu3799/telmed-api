import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { LocationDto } from './location.dto';

export class DoctorProfilePutDto {
  @ApiProperty({ example: 'Maria' })
  @IsString()
  @MinLength(1)
  firstName!: string;

  @ApiProperty({ example: 'Gonzalez' })
  @IsString()
  @MinLength(1)
  lastName!: string;

  @ApiPropertyOptional({ example: 'Cardiologo con 10 anos de experiencia.' })
  @IsOptional()
  @IsString()
  bio?: string | null;

  @ApiProperty({ example: 150000 })
  @IsInt()
  @Min(0)
  priceCents!: number;

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
