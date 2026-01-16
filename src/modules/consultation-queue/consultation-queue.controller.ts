import {
  Body,
  Controller,
  Get,
  Headers,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { AuditAction, UserRole } from '@prisma/client';
import type { Request } from 'express';
import { ProblemDetailsDto } from '../../common/docs/problem-details.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { Actor } from '../../common/types/actor.type';
import { AuditService } from '../../infra/audit/audit.service';
import {
  ConsultationQueueConsultationDto,
  ConsultationQueueItemDto,
} from './docs/consultation-queue.dto';
import { EmergenciesResponseDto } from './docs/emergency-list.dto';
import { ConsultationQueueService } from './consultation-queue.service';
import { PaymentCheckoutDto } from '../payments/docs/payment.dto';
import { CancelQueueDto } from './dto/cancel-queue.dto';
import { CreateQueueDto } from './dto/create-queue.dto';
import { FinalizeConsultationDto } from './dto/finalize-consultation.dto';
import { RejectQueueDto } from './dto/reject-queue.dto';
import { ListEmergenciesQueryDto } from './dto/list-emergencies-query.dto';

@ApiTags('consultations')
@Controller()
export class ConsultationQueueController {
  private readonly logger = new Logger(ConsultationQueueController.name);

  constructor(
    private readonly consultationQueueService: ConsultationQueueService,
    private readonly auditService: AuditService,
  ) {}

  @Post('consultations/queue')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.patient, UserRole.doctor, UserRole.admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create consultation queue item' })
  @ApiBody({ type: CreateQueueDto })
  @ApiCreatedResponse({ type: ConsultationQueueItemDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async createQueue(
    @CurrentUser() actor: Actor,
    @Body() dto: CreateQueueDto,
    @Req() req: Request,
  ) {
    const queue = await this.consultationQueueService.createQueue(actor, dto);
    // Audit queue creation for operational traceability.
    await this.auditService.log({
      action: AuditAction.WRITE,
      resourceType: 'ConsultationQueueItem',
      resourceId: queue.id,
      actor,
      traceId: (req as Request & { traceId?: string }).traceId ?? null,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
      metadata: { entryType: queue.entryType },
    });
    return queue;
  }

  @Get('consultations/queue/:queueItemId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.patient, UserRole.doctor, UserRole.admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get queue item' })
  @ApiOkResponse({ type: ConsultationQueueItemDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async getQueue(
    @CurrentUser() actor: Actor,
    @Param('queueItemId') queueItemId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Disable caching for dynamic status endpoints
    // This ensures polling always gets fresh data and doesn't receive 304 Not Modified
    res.setHeader(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, max-age=0',
    );
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    // Disable ETag to prevent 304 responses
    res.removeHeader('ETag');

    return this.consultationQueueService.getQueueById(actor, queueItemId);
  }

  @Post('consultations/queue/:queueItemId/accept')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.doctor, UserRole.admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Accept queue item' })
  @ApiOkResponse({ type: ConsultationQueueItemDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async acceptQueue(
    @CurrentUser() actor: Actor,
    @Param('queueItemId') queueItemId: string,
    @Req() req: Request,
  ) {
    const queue = await this.consultationQueueService.acceptQueue(
      actor,
      queueItemId,
    );
    // Audit queue transitions for emergency flow.
    await this.auditService.log({
      action: AuditAction.WRITE,
      resourceType: 'ConsultationQueueItem',
      resourceId: queue.id,
      actor,
      traceId: (req as Request & { traceId?: string }).traceId ?? null,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
      metadata: { transition: 'accept', entryType: queue.entryType },
    });
    return queue;
  }

  @Post('consultations/queue/:queueItemId/payment')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.patient)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Start emergency payment for queue item' })
  @ApiOkResponse({ type: PaymentCheckoutDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async payForQueue(
    @CurrentUser() actor: Actor,
    @Param('queueItemId') queueItemId: string,
    @Headers('Idempotency-Key') idempotencyKey?: string,
    @Req() req?: Request,
  ) {
    const payment = await this.consultationQueueService.requestPaymentForQueue(
      actor,
      queueItemId,
      idempotencyKey,
    );
    // Audit payment creation for emergency flows.
    await this.auditService.log({
      action: AuditAction.WRITE,
      resourceType: 'Payment',
      resourceId: payment.id,
      actor,
      traceId: (req as Request & { traceId?: string }).traceId ?? null,
      ip: req?.ip,
      userAgent: req?.get('user-agent') ?? null,
      metadata: { queueItemId },
    });
    return payment;
  }
  @Post('consultations/queue/:queueItemId/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.doctor, UserRole.admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Reject queue item' })
  @ApiBody({ type: RejectQueueDto })
  @ApiOkResponse({ type: ConsultationQueueItemDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async rejectQueue(
    @CurrentUser() actor: Actor,
    @Param('queueItemId') queueItemId: string,
    @Body() dto: RejectQueueDto,
  ) {
    return this.consultationQueueService.rejectQueue(actor, queueItemId, dto);
  }

  @Post('consultations/queue/:queueItemId/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.patient, UserRole.doctor, UserRole.admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Cancel queue item' })
  @ApiBody({ type: CancelQueueDto })
  @ApiOkResponse({ type: ConsultationQueueItemDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async cancelQueue(
    @CurrentUser() actor: Actor,
    @Param('queueItemId') queueItemId: string,
    @Body() dto: CancelQueueDto,
  ) {
    return this.consultationQueueService.cancelQueue(actor, queueItemId, dto);
  }

  @Get('consultations/queue')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.doctor, UserRole.admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List queue items (doctor/admin)' })
  @ApiQuery({
    name: 'includeClosed',
    required: false,
    type: Boolean,
    description: 'Include closed queue items',
  })
  @ApiOkResponse({ type: [ConsultationQueueItemDto] })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  listQueue(
    @CurrentUser() actor: Actor,
    @Query('includeClosed') includeClosed?: string,
  ) {
    const includeClosedFlag = includeClosed === 'true';
    if (actor.role === UserRole.admin) {
      return this.consultationQueueService.listQueueForAdmin(includeClosedFlag);
    }
    return this.consultationQueueService.listQueueForDoctor(
      actor,
      includeClosedFlag,
    );
  }

  @Get('doctors/me/emergencies')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.doctor)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List doctor emergencies' })
  @ApiOkResponse({ type: EmergenciesResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  listDoctorEmergencies(
    @CurrentUser() actor: Actor,
    @Query() query: ListEmergenciesQueryDto,
  ) {
    return this.consultationQueueService.listEmergenciesForDoctor(actor, query);
  }

  @Get('patients/me/emergencies')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.patient)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List patient emergencies' })
  @ApiOkResponse({ type: EmergenciesResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  listPatientEmergencies(
    @CurrentUser() actor: Actor,
    @Query() query: ListEmergenciesQueryDto,
  ) {
    return this.consultationQueueService.listEmergenciesForPatient(
      actor,
      query,
    );
  }

  @Post('consultations/queue/:queueItemId/start')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.doctor, UserRole.admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Start consultation from queue' })
  @ApiCreatedResponse({ type: ConsultationQueueConsultationDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async startQueueConsultation(
    @CurrentUser() actor: Actor,
    @Param('queueItemId') queueItemId: string,
    @Req() req: Request,
  ) {
    const traceId = (req as Request & { traceId?: string }).traceId ?? null;

    // Log start request initiation
    this.logger.log(
      JSON.stringify({
        event: 'start_consultation_request',
        method: 'POST',
        path: `/api/v1/consultations/queue/${queueItemId}/start`,
        queueItemId,
        actorUserId: actor.id,
        actorRole: actor.role,
        traceId,
      }),
    );

    const result = await this.consultationQueueService.startFromQueue(
      actor,
      queueItemId,
      traceId,
    );

    // Audit consultation starts for queue-driven flows.
    await this.auditService.log({
      action: AuditAction.WRITE,
      resourceType: 'Consultation',
      resourceId: result.consultation.id,
      actor,
      traceId,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
      metadata: { queueItemId },
    });

    // Log successful start completion
    this.logger.log(
      JSON.stringify({
        event: 'start_consultation_completed',
        queueItemId,
        consultationId: result.consultation.id,
        queueStatus: result.queueItem.status,
        consultationStatus: result.consultation.status,
        actorUserId: actor.id,
        actorRole: actor.role,
        traceId,
      }),
    );

    return result;
  }

  @Post('consultations/:id/finalize')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.doctor, UserRole.admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Finalize consultation' })
  @ApiBody({ type: FinalizeConsultationDto })
  @ApiOkResponse({ type: ConsultationQueueConsultationDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  finalize(
    @CurrentUser() actor: Actor,
    @Param('id') consultationId: string,
    @Body() dto: FinalizeConsultationDto,
  ) {
    return this.consultationQueueService.finalizeConsultation(
      actor,
      consultationId,
      dto,
    );
  }
}
