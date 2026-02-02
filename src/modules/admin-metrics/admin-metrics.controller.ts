import { Controller, Get, Logger, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { Request } from 'express';
import { ProblemDetailsDto } from '../../common/docs/problem-details.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { Actor } from '../../common/types/actor.type';
import { AdminMetricsService } from './admin-metrics.service';

@ApiTags('admin')
@Controller('admin/metrics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin)
@ApiBearerAuth('access-token')
export class AdminMetricsController {
  private readonly logger = new Logger(AdminMetricsController.name);

  constructor(private readonly metricsService: AdminMetricsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Admin metrics overview' })
  @ApiOkResponse({ description: 'Overview metrics' })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async overview(@CurrentUser() actor: Actor, @Req() req: Request) {
    this.logger.log(
      JSON.stringify({
        event: 'admin_metrics_overview',
        actorId: actor.id,
        traceId: (req as Request & { traceId?: string }).traceId ?? null,
      }),
    );
    return this.metricsService.getOverview();
  }

  @Get('health')
  @ApiOperation({ summary: 'Admin metrics health checks' })
  @ApiOkResponse({ description: 'Health checks' })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async health(@CurrentUser() actor: Actor, @Req() req: Request) {
    this.logger.log(
      JSON.stringify({
        event: 'admin_metrics_health',
        actorId: actor.id,
        traceId: (req as Request & { traceId?: string }).traceId ?? null,
      }),
    );
    return this.metricsService.getHealth();
  }

  @Get('jobs')
  @ApiOperation({ summary: 'Admin metrics jobs' })
  @ApiOkResponse({ description: 'Job queues metrics' })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async jobs(@CurrentUser() actor: Actor, @Req() req: Request) {
    this.logger.log(
      JSON.stringify({
        event: 'admin_metrics_jobs',
        actorId: actor.id,
        traceId: (req as Request & { traceId?: string }).traceId ?? null,
      }),
    );
    return this.metricsService.getJobs();
  }
}
