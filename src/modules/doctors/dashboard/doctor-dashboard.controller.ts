import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ProblemDetailsDto } from '../../../common/docs/problem-details.dto';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import type { Actor } from '../../../common/types/actor.type';
import { DoctorDashboardOverviewDto } from './docs/doctor-dashboard-overview.dto';
import { DoctorPaymentsResponseDto } from './docs/doctor-payments.dto';
import { DoctorDashboardOverviewQueryDto } from './dto/doctor-dashboard-overview-query.dto';
import { DoctorPaymentsQueryDto } from './dto/doctor-payments-query.dto';
import { DoctorDashboardService } from './doctor-dashboard.service';

/**
 * Doctor dashboard controller.
 * What it does:
 * - Exposes overview KPIs and payment listings for the authenticated doctor.
 */
@ApiTags('doctors')
@Controller('doctors/me')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.doctor)
@ApiBearerAuth('access-token')
export class DoctorDashboardController {
  constructor(private readonly dashboardService: DoctorDashboardService) {}

  @Get('dashboard/overview')
  @ApiOperation({ summary: 'Doctor dashboard overview (KPIs)' })
  @ApiOkResponse({ type: DoctorDashboardOverviewDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async getOverview(
    @CurrentUser() actor: Actor,
    @Query() query: DoctorDashboardOverviewQueryDto,
  ) {
    return this.dashboardService.getOverview(actor, query.range);
  }

  @Get('payments')
  @ApiOperation({ summary: 'List doctor payments' })
  @ApiOkResponse({ type: DoctorPaymentsResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async listPayments(
    @CurrentUser() actor: Actor,
    @Query() query: DoctorPaymentsQueryDto,
  ) {
    return this.dashboardService.listPayments(actor, query);
  }
}
