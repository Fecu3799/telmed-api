import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
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
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { AuditAction, UserRole } from '@prisma/client';
import { ProblemDetailsDto } from '../../common/docs/problem-details.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { Actor } from '../../common/types/actor.type';
import { ConsultationDto } from './docs/consultation.dto';
import { ConsultationAdminDto } from './docs/consultation-admin.dto';
import { LiveKitTokenDto } from './docs/livekit-token.dto';
// Removed: ConsultationMessagesResponseDto, ConsultationMessageDto (chat messages now handled by chats module)
import {
  ConsultationFileDownloadDto,
  ConsultationFilePrepareResponseDto,
} from './docs/consultation-file.dto';
import { ConsultationsService } from './consultations.service';
import { ConsultationPatchDto } from './dto/consultation-patch.dto';
import { AuditService } from '../../infra/audit/audit.service';
import { ConsultationRealtimeService } from './consultation-realtime.service';
// Removed: ConsultationMessagesQueryDto (chat messages now handled by chats module)
import { ConsultationFilePrepareDto } from './dto/consultation-file-prepare.dto';
import { ConsultationFileConfirmDto } from './dto/consultation-file-confirm.dto';
import { ConsultationRealtimeGateway } from './consultation-realtime.gateway';

@ApiTags('consultations')
@Controller()
export class ConsultationsController {
  constructor(
    private readonly consultationsService: ConsultationsService,
    private readonly auditService: AuditService,
    private readonly consultationRealtimeService: ConsultationRealtimeService,
    private readonly consultationRealtimeGateway: ConsultationRealtimeGateway,
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
  @ApiExtraModels(ConsultationDto, ConsultationAdminDto)
  @ApiOkResponse({
    schema: {
      oneOf: [
        { $ref: getSchemaPath(ConsultationDto) },
        { $ref: getSchemaPath(ConsultationAdminDto) },
      ],
    },
  })
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
    if (actor.role === UserRole.admin) {
      return this.toAdminView(consultation);
    }
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
    this.consultationRealtimeGateway.emitConsultationClosed(
      consultation.id,
      consultation.closedAt ?? new Date(),
    );
    return this.withConsultationExtras(consultation);
  }

  @Post('consultations/:id/livekit-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.patient, UserRole.doctor)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Issue LiveKit token for consultation' })
  @ApiOkResponse({ type: LiveKitTokenDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async issueLivekitToken(
    @CurrentUser() actor: Actor,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.consultationRealtimeService.issueLivekitToken(
      actor,
      id,
      (req as Request & { traceId?: string }).traceId ?? undefined,
    );
  }

  // Removed: GET consultations/:id/messages endpoint
  // Chat messages are now handled by the chats module (GET /api/v1/chats/threads/:threadId/messages)

  @Post('consultations/:id/files/prepare')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.patient, UserRole.doctor)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Prepare consultation file upload' })
  @ApiBody({ type: ConsultationFilePrepareDto })
  @ApiCreatedResponse({ type: ConsultationFilePrepareResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async prepareFile(
    @CurrentUser() actor: Actor,
    @Param('id') id: string,
    @Body() dto: ConsultationFilePrepareDto,
    @Req() req: Request,
  ) {
    return this.consultationRealtimeService.prepareFileUpload(
      actor,
      id,
      dto,
      (req as Request & { traceId?: string }).traceId ?? undefined,
    );
  }

  @Post('consultations/:id/files/confirm')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.patient, UserRole.doctor)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Confirm consultation file upload' })
  @ApiBody({ type: ConsultationFileConfirmDto })
  @ApiOkResponse()
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async confirmFile(
    @CurrentUser() actor: Actor,
    @Param('id') id: string,
    @Body() dto: ConsultationFileConfirmDto,
  ) {
    // File upload confirmed - file is ready for use
    // Note: File sharing in consultations is now handled via chat messages (chats module)
    return this.consultationRealtimeService.confirmFileUpload(
      actor,
      id,
      dto.fileId,
    );
  }

  @Get('consultations/:id/files/:fileId/download')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.patient, UserRole.doctor)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Download consultation file (presigned URL)' })
  @ApiOkResponse({ type: ConsultationFileDownloadDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async downloadFile(
    @CurrentUser() actor: Actor,
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @Req() req: Request,
  ) {
    return this.consultationRealtimeService.getDownloadUrl(
      actor,
      id,
      fileId,
      (req as Request & { traceId?: string }).traceId ?? undefined,
    );
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

  private toAdminView(consultation: {
    id: string;
    status: string;
    startedAt?: Date | null;
    closedAt?: Date | null;
    doctorUserId: string;
    patientUserId: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: consultation.id,
      status: consultation.status,
      startedAt: consultation.startedAt ?? null,
      closedAt: consultation.closedAt ?? null,
      doctorUserId: consultation.doctorUserId,
      patientUserId: consultation.patientUserId,
      createdAt: consultation.createdAt,
      updatedAt: consultation.updatedAt,
    };
  }
}
