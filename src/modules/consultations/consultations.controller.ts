import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { AuditAction, UserRole } from '@prisma/client';
import { ProblemDetailsDto } from '../../common/docs/problem-details.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { Actor } from '../../common/types/actor.type';
import { ConsultationDto } from './docs/consultation.dto';
import { ConsultationsService } from './consultations.service';
import { ConsultationPatchDto } from './dto/consultation-patch.dto';
import { AuditService } from '../../infra/audit/audit.service';

@ApiTags('consultations')
@Controller()
export class ConsultationsController {
  constructor(
    private readonly consultationsService: ConsultationsService,
    private readonly auditService: AuditService,
  ) {}

  @Post('appointments/:appointmentId/consultation')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.doctor, UserRole.admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create or get consultation for appointment' })
  @ApiCreatedResponse({ type: ConsultationDto })
  @ApiOkResponse({ type: ConsultationDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async create(
    @CurrentUser() actor: Actor,
    @Param('appointmentId') appointmentId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.consultationsService.createForAppointment(
      actor,
      appointmentId,
    );
    res.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return result.consultation;
  }

  @Get('consultations/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.patient, UserRole.doctor, UserRole.admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get consultation' })
  @ApiOkResponse({ type: ConsultationDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async get(
    @CurrentUser() actor: Actor,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const consultation = await this.consultationsService.getById(actor, id);
    // Audit reads for consultation access.
    await this.auditService.log({
      action: AuditAction.READ,
      resourceType: 'Consultation',
      resourceId: consultation.id,
      actor,
      traceId: (req as Request & { traceId?: string }).traceId ?? null,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
    });
    return this.withConsultationExtras(consultation);
  }

  @Patch('consultations/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.doctor, UserRole.admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update consultation' })
  @ApiBody({ type: ConsultationPatchDto })
  @ApiOkResponse({ type: ConsultationDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async patch(
    @CurrentUser() actor: Actor,
    @Param('id') id: string,
    @Body() dto: ConsultationPatchDto,
  ) {
    const consultation = await this.consultationsService.patch(actor, id, dto);
    return this.withConsultationExtras(consultation);
  }

  @Post('consultations/:id/start')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.doctor, UserRole.admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Start consultation' })
  @ApiOkResponse({ type: ConsultationDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  @HttpCode(HttpStatus.OK)
  async start(@CurrentUser() actor: Actor, @Param('id') id: string) {
    const consultation = await this.consultationsService.start(actor, id);
    return this.withConsultationExtras(consultation);
  }

  @Post('consultations/:id/close')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.doctor, UserRole.admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Close consultation' })
  @ApiBody({ type: ConsultationPatchDto })
  @ApiOkResponse({ type: ConsultationDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  @HttpCode(HttpStatus.OK)
  async close(
    @CurrentUser() actor: Actor,
    @Param('id') id: string,
    @Body() dto: ConsultationPatchDto,
    @Req() req: Request,
  ) {
    const consultation = await this.consultationsService.close(actor, id, dto);
    // Audit consultation closures for clinical traceability.
    await this.auditService.log({
      action: AuditAction.WRITE,
      resourceType: 'Consultation',
      resourceId: consultation.id,
      actor,
      traceId: (req as Request & { traceId?: string }).traceId ?? null,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
      metadata: { fields: Object.keys(dto ?? {}) },
    });
    return this.withConsultationExtras(consultation);
  }

  private withConsultationExtras(consultation: {
    id: string;
    queueItem?: {
      id: string;
      entryType: string;
      reason: string | null;
      paymentStatus: string | null;
      appointmentId: string | null;
    } | null;
  }) {
    return {
      ...consultation,
      videoUrl: `https://video.telmed.local/consultations/${consultation.id}`,
    };
  }
}
