import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt } from 'class-validator';

const ALLOWED_DURATIONS = [15, 20, 30, 45, 60] as const;

export class DoctorSchedulingConfigUpdateDto {
  @ApiProperty({ example: 30, enum: ALLOWED_DURATIONS })
  @IsInt()
  @IsIn(ALLOWED_DURATIONS)
  slotDurationMinutes!: number;
}
