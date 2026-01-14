import { ApiProperty } from '@nestjs/swagger';
import { PatientSummaryDto } from './patient-summary.dto';

export class PageInfoDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 10 })
  limit!: number;

  @ApiProperty({ example: 25 })
  total!: number;

  @ApiProperty({ example: true })
  hasNextPage!: boolean;

  @ApiProperty({ example: false })
  hasPrevPage!: boolean;
}

export class DoctorPatientsResponseDto {
  @ApiProperty({ type: [PatientSummaryDto] })
  items!: PatientSummaryDto[];

  @ApiProperty({ type: PageInfoDto })
  pageInfo!: PageInfoDto;
}
