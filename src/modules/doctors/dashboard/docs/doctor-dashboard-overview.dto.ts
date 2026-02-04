import { ApiProperty } from '@nestjs/swagger';

export class DoctorDashboardKpisDto {
  @ApiProperty({ example: 240000 })
  grossEarningsCents!: number;

  @ApiProperty({ example: 36000 })
  platformFeesCents!: number;

  @ApiProperty({ example: 276000 })
  totalChargedCents!: number;

  @ApiProperty({ example: 3 })
  paidPaymentsCount!: number;

  @ApiProperty({ example: 2 })
  uniquePatientsCount!: number;
}

export class DoctorDashboardOverviewDto {
  @ApiProperty({ example: '30d' })
  range!: string;

  @ApiProperty({ example: 'ARS' })
  currency!: string;

  @ApiProperty({ type: DoctorDashboardKpisDto })
  kpis!: DoctorDashboardKpisDto;
}
