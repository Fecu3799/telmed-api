import { ApiProperty } from '@nestjs/swagger';

export class DoctorSlotDto {
  @ApiProperty({ example: '2025-01-02T09:00:00.000Z' })
  startAt!: string;

  @ApiProperty({ example: '2025-01-02T09:20:00.000Z' })
  endAt!: string;

  @ApiProperty({ example: 'available', enum: ['available', 'booked'] })
  status!: 'available' | 'booked';
}

export class DoctorSlotsResponseDto {
  @ApiProperty({ example: 'b0f6a7ef-4f1e-4d7b-b63a-0f4f3d3d9f9b' })
  doctorId!: string;

  @ApiProperty({ example: '2025-01-01T00:00:00.000Z' })
  from!: string;

  @ApiProperty({ example: '2025-01-07T23:59:59.000Z' })
  to!: string;

  @ApiProperty({ example: 20 })
  slotDurationMinutes!: number;

  @ApiProperty({ type: [DoctorSlotDto] })
  slots!: DoctorSlotDto[];
}
