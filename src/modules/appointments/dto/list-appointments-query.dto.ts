import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsISO8601, IsInt, IsOptional, Min } from 'class-validator';

export class ListAppointmentsQueryDto {
  @ApiProperty({ example: '2025-01-01T00:00:00.000Z' })
  @IsISO8601()
  from!: string;

  @ApiProperty({ example: '2025-01-31T23:59:59.000Z' })
  @IsISO8601()
  to!: string;

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
  limit?: number;
}
