import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import { DoctorVerificationStatus } from '@prisma/client';

export class DoctorSearchQueryDto {
  @ApiPropertyOptional({ example: 'cardio' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  q?: string;

  @ApiPropertyOptional({ example: -34.6037 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional({ example: -58.3816 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  radiusKm?: number;

  @ApiPropertyOptional({ example: 'b9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  @IsOptional()
  @IsUUID('4')
  specialtyId?: string;

  @ApiPropertyOptional({ example: 150000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPriceCents?: number;

  @ApiPropertyOptional({ example: 'relevance', enum: ['relevance', 'distance', 'price_asc', 'price_desc', 'name_asc', 'name_desc'] })
  @IsOptional()
  @IsEnum(['relevance', 'distance', 'price_asc', 'price_desc', 'name_asc', 'name_desc'] as const)
  sort?: 'relevance' | 'distance' | 'price_asc' | 'price_desc' | 'name_asc' | 'name_desc';

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ example: 'eyJzb3J0IjoicmVsZXZhbmNlIiwibGFzdElkIjoiLi4uIn0' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ example: 'verified', enum: DoctorVerificationStatus })
  @IsOptional()
  @IsEnum(DoctorVerificationStatus)
  verificationStatus?: DoctorVerificationStatus;
}
