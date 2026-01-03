import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
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
import { ConsultationQueueService } from './consultation-queue.service';
import { PaymentCheckoutDto } from '../payments/docs/payment.dto';
import { CancelQueueDto } from './dto/cancel-queue.dto';
import { CreateQueueDto } from './dto/create-queue.dto';
import { FinalizeConsultationDto } from './dto/finalize-consultation.dto';
import { RejectQueueDto } from './dto/reject-queue.dto';

@ApiTags('consultations')
@Controller()
export class ConsultationQueueController {
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
  ) {
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
    const result = await this.consultationQueueService.startFromQueue(
      actor,
      queueItemId,
    );
    // Audit consultation starts for queue-driven flows.
    await this.auditService.log({
      action: AuditAction.WRITE,
      resourceType: 'Consultation',
      resourceId: result.consultation.id,
      actor,
      traceId: (req as Request & { traceId?: string }).traceId ?? null,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
      metadata: { queueItemId },
    });
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
