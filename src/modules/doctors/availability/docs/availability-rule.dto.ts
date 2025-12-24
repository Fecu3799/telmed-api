import { ApiProperty } from '@nestjs/swagger';

export class AvailabilityRuleDto {
  @ApiProperty({ example: 'b9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  id!: string;

  @ApiProperty({ example: 1 })
  dayOfWeek!: number;

  @ApiProperty({ example: '09:00' })
  startTime!: string;

  @ApiProperty({ example: '17:00' })
  endTime!: string;

  @ApiProperty({ example: true })
  isActive!: boolean;
}
