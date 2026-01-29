import { ApiProperty } from '@nestjs/swagger';

export class DoctorSchedulingConfigDto {
  @ApiProperty({ example: 'b0f6a7ef-4f1e-4d7b-b63a-0f4f3d3d9f9b' })
  userId!: string;

  @ApiProperty({ example: 20 })
  slotDurationMinutes!: number;

  @ApiProperty({ example: 24 })
  leadTimeHours!: number;

  @ApiProperty({ example: 60 })
  horizonDays!: number;

  @ApiProperty({ example: 'America/Argentina/Buenos_Aires' })
  timezone!: string;

  @ApiProperty({ example: '2025-01-01T00:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2025-01-02T00:00:00.000Z' })
  updatedAt!: string;
}
