import { ApiProperty } from '@nestjs/swagger';

export class PublicAvailabilitySlotDto {
  @ApiProperty({ example: '2025-01-02T09:00:00.000Z' })
  startAt!: string;

  @ApiProperty({ example: '2025-01-02T10:00:00.000Z' })
  endAt!: string;
}

export class PublicAvailabilityResponseDto {
  @ApiProperty({ type: [PublicAvailabilitySlotDto] })
  items!: PublicAvailabilitySlotDto[];

  @ApiProperty({
    example: {
      timezone: 'America/Argentina/Buenos_Aires',
      slotDurationMinutes: 60,
      leadTimeHours: 24,
      horizonDays: 60,
    },
  })
  meta!: {
    timezone: string;
    slotDurationMinutes: number;
    leadTimeHours: number;
    horizonDays: number;
  };
}
