import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class AvailabilityWindowDto {
  @ApiProperty({ example: '09:00' })
  @IsString()
  @Matches(TIME_REGEX)
  startTime!: string;

  @ApiProperty({ example: '12:00' })
  @IsString()
  @Matches(TIME_REGEX)
  endTime!: string;
}
