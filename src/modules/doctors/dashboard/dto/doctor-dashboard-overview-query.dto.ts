import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/**
 * Dashboard overview query inputs.
 * What it does:
 * - Captures the range string; validation of allowed values happens in the service.
 */
export class DoctorDashboardOverviewQueryDto {
  @ApiPropertyOptional({ example: '30d', description: '7d | 30d | ytd' })
  @IsOptional()
  @IsString()
  range?: string;
}
