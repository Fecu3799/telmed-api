import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class GeoNearbyQueryDto {
  @ApiProperty({ example: -34.6037 })
  @Type(() => Number)
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({ example: -58.3816 })
  @Type(() => Number)
  @Min(-180)
  @Max(180)
  lng!: number;

  @ApiProperty({ example: 5000, description: 'Radius in meters.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  radiusMeters!: number;

  @ApiPropertyOptional({ example: 'b9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  @IsOptional()
  @IsUUID()
  specialtyId?: string;

  @ApiPropertyOptional({ example: 150000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPriceCents?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}
