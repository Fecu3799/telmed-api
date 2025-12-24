import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class AvailabilityExceptionsQueryDto {
  @ApiProperty({ example: '2025-01-01' })
  @IsString()
  @Matches(DATE_REGEX)
  from!: string;

  @ApiProperty({ example: '2025-01-31' })
  @IsString()
  @Matches(DATE_REGEX)
  to!: string;
}
