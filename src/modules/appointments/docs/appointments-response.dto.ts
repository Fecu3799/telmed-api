import { ApiProperty } from '@nestjs/swagger';
import { AppointmentDto } from './appointment.dto';

export class AppointmentsPageInfoDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: true })
  hasNextPage!: boolean;

  @ApiProperty({ example: false, required: false })
  hasPrevPage?: boolean;
}

export class AppointmentsResponseDto {
  @ApiProperty({ type: [AppointmentDto] })
  items!: AppointmentDto[];

  @ApiProperty({ type: AppointmentsPageInfoDto })
  pageInfo!: AppointmentsPageInfoDto;
}
