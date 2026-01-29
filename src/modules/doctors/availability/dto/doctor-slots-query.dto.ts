import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601 } from 'class-validator';

export class DoctorSlotsQueryDto {
  @ApiProperty({ example: '2025-01-01T00:00:00.000Z' })
  @IsISO8601()
  from!: string;

  @ApiProperty({ example: '2025-01-07T23:59:59.000Z' })
  @IsISO8601()
  to!: string;
}
