import { Module } from '@nestjs/common';
import { DoctorDashboardController } from './doctor-dashboard.controller';
import { DoctorDashboardService } from './doctor-dashboard.service';

/**
 * Doctor dashboard module.
 * What it does:
 * - Wires KPI overview and payments list endpoints for doctors.
 */
@Module({
  controllers: [DoctorDashboardController],
  providers: [DoctorDashboardService],
})
export class DoctorDashboardModule {}
