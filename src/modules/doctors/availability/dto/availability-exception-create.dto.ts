import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';
import { DoctorAvailabilityExceptionType } from '@prisma/client';
import { AvailabilityWindowDto } from './availability-window.dto';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class AvailabilityExceptionCreateDto {
  @ApiProperty({ example: '2025-01-15' })
  @IsString()
  @Matches(DATE_REGEX)
  date!: string;

  @ApiProperty({ example: 'closed', enum: DoctorAvailabilityExceptionType })
  @IsEnum(DoctorAvailabilityExceptionType)
  type!: DoctorAvailabilityExceptionType;

  @ApiPropertyOptional({ type: [AvailabilityWindowDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AvailabilityWindowDto)
  customWindows?: AvailabilityWindowDto[];
}
