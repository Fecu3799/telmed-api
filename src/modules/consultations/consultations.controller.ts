import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
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
import { ActiveConsultationResponseDto } from './docs/active-consultation.dto';
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
import { SetClinicalEpisodeFormattedDto } from './dto/set-clinical-episode-formatted.dto';
import { UpsertClinicalEpisodeDraftDto } from './dto/upsert-clinical-episode-draft.dto';
import { CreateClinicalEpisodeAddendumDto } from './dto/create-clinical-episode-addendum.dto';
import { ConsultationRealtimeGateway } from './consultation-realtime.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ClinicalEpisodeAddendumResponseDto,
  ClinicalEpisodeDraftResponseDto,
  ClinicalEpisodeResponseDto,
} from './docs/clinical-episode-draft.dto';

/**
 * Consulta API (create/get/patch/close + realtime helpers)
 * - Endpoints para crud y helpers de realtime: emitir token LiveKit y manejo de archivos.
 *
 * How it works:
 * - POST /appointments/:appointmentId/consultation (doctor/admin): create-or-get de consulta para un appointment.
 * - GET /consultations/:id (patient/doctor/admin): devuelve consulta; Audita lecturas.
 * - PATCH /consultations/:id (doctor/admin): no-op legacy endpoint (kept for compatibility).
 * - POST /consultations/:id/close (doctor/admin): cierra consulta, audita writes, emite consultation.closed por Socket, notifica consultationsChanged.
 * - GET /consultations/me/active (patient/doctor): retorna consulta in_progress actual (si existe).
 * - POST /consultations/:id/livekit-token : emite token LiveKit (solo participantes)
 * - Files: prepare/confirm/download delegan a ConsultationRealtimeService (subida por presigned URL y confirm)
 */

@ApiTags('consultations')
@Controller()
export class ConsultationsController {
  constructor(
    private readonly consultationsService: ConsultationsService,
    private readonly auditService: AuditService,
    private readonly consultationRealtimeService: ConsultationRealtimeService,
    private readonly consultationRealtimeGateway: ConsultationRealtimeGateway,
    private readonly notifications: NotificationsService,
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
    this.notifications.consultationsChanged([
      consultation.doctorUserId,
      consultation.patientUserId,
    ]);
    return this.withConsultationExtras(consultation);
  }

  @Put('consultations/:consultationId/clinical-episode/draft')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.doctor)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Upsert clinical episode draft (doctor)' })
  @ApiBody({ type: UpsertClinicalEpisodeDraftDto })
  @ApiOkResponse({ type: ClinicalEpisodeDraftResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async upsertClinicalEpisodeDraft(
    @CurrentUser() actor: Actor,
    @Param('consultationId') consultationId: string,
    @Body() dto: UpsertClinicalEpisodeDraftDto,
    @Req() req: Request,
  ) {
    const result = await this.consultationsService.upsertClinicalEpisodeDraft(
      actor,
      consultationId,
      dto,
    );

    await this.auditService.log({
      action: AuditAction.WRITE,
      resourceType: 'clinical_episode_draft',
      resourceId: result.draft.id,
      actor,
      traceId: (req as Request & { traceId?: string }).traceId ?? null,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
      metadata: {
        consultationId,
      },
    });

    return result;
  }

  @Post('consultations/:consultationId/clinical-episode/finalize')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.doctor)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Finalize clinical episode (doctor)' })
  @ApiCreatedResponse({ type: ClinicalEpisodeResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async finalizeClinicalEpisode(
    @CurrentUser() actor: Actor,
    @Param('consultationId') consultationId: string,
    @Req() req: Request,
  ) {
    const result = await this.consultationsService.finalizeClinicalEpisode(
      actor,
      consultationId,
    );

    await this.auditService.log({
      action: AuditAction.WRITE,
      resourceType: 'clinical_episode_final',
      resourceId: result.final.id,
      actor,
      traceId: (req as Request & { traceId?: string }).traceId ?? null,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
      metadata: {
        consultationId,
      },
    });

    return result;
  }

  @Put('consultations/:consultationId/clinical-episode/final/formatted')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.doctor)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Set formatted clinical episode (doctor)' })
  @ApiBody({ type: SetClinicalEpisodeFormattedDto })
  @ApiOkResponse({ type: ClinicalEpisodeResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async setClinicalEpisodeFormatted(
    @CurrentUser() actor: Actor,
    @Param('consultationId') consultationId: string,
    @Body() dto: SetClinicalEpisodeFormattedDto,
    @Req() req: Request,
  ) {
    const result =
      await this.consultationsService.setClinicalEpisodeFinalFormatted(
        actor,
        consultationId,
        dto,
      );

    await this.auditService.log({
      action: AuditAction.WRITE,
      resourceType: 'clinical_episode_final_formatted',
      resourceId: result.final.id,
      actor,
      traceId: (req as Request & { traceId?: string }).traceId ?? null,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
      metadata: {
        consultationId,
        formatVersion: dto.formatVersion ?? null,
      },
    });

    return result;
  }

  @Post('consultations/:consultationId/clinical-episode/addendums')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.doctor)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create clinical episode addendum (doctor)' })
  @ApiBody({ type: CreateClinicalEpisodeAddendumDto })
  @ApiCreatedResponse({ type: ClinicalEpisodeAddendumResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async createClinicalEpisodeAddendum(
    @CurrentUser() actor: Actor,
    @Param('consultationId') consultationId: string,
    @Body() dto: CreateClinicalEpisodeAddendumDto,
    @Req() req: Request,
  ) {
    const result = await this.consultationsService.createClinicalEpisodeAddendum(
      actor,
      consultationId,
      dto,
    );

    await this.auditService.log({
      action: AuditAction.WRITE,
      resourceType: 'clinical_episode_addendum',
      resourceId: result.addendum.id,
      actor,
      traceId: (req as Request & { traceId?: string }).traceId ?? null,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
      metadata: {
        consultationId,
      },
    });

    return result;
  }

  @Get('consultations/:consultationId/clinical-episode')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.patient, UserRole.doctor)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get clinical episode (doctor/patient)' })
  @ApiOkResponse({ type: ClinicalEpisodeResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async getClinicalEpisode(
    @CurrentUser() actor: Actor,
    @Param('consultationId') consultationId: string,
    @Req() req: Request,
  ) {
    if (actor.role === UserRole.patient) {
      const result =
        await this.consultationsService.getClinicalEpisodeForPatient(
          actor,
          consultationId,
        );

      await this.auditService.log({
        action: AuditAction.READ,
        resourceType: 'clinical_episode_final',
        resourceId: result.final.id,
        actor,
        traceId: (req as Request & { traceId?: string }).traceId ?? null,
        ip: req.ip,
        userAgent: req.get('user-agent') ?? null,
        metadata: {
          consultationId,
        },
      });

      return result;
    }

    const result = await this.consultationsService.getClinicalEpisodeForDoctor(
      actor,
      consultationId,
    );

    if (result.final) {
      await this.auditService.log({
        action: AuditAction.READ,
        resourceType: 'clinical_episode_final',
        resourceId: result.final.id,
        actor,
        traceId: (req as Request & { traceId?: string }).traceId ?? null,
        ip: req.ip,
        userAgent: req.get('user-agent') ?? null,
        metadata: {
          consultationId,
        },
      });
    } else if (result.draft) {
      await this.auditService.log({
        action: AuditAction.READ,
        resourceType: 'clinical_episode_draft',
        resourceId: result.draft.id,
        actor,
        traceId: (req as Request & { traceId?: string }).traceId ?? null,
        ip: req.ip,
        userAgent: req.get('user-agent') ?? null,
        metadata: {
          consultationId,
        },
      });
    }

    return result;
  }

  @Get('consultations/me/active')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.patient, UserRole.doctor)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get active consultation for current user' })
  @ApiOkResponse({ type: ActiveConsultationResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async getActive(@CurrentUser() actor: Actor) {
    const active = await this.consultationsService.getActiveForActor(actor);
    if (!active) {
      return { consultation: null };
    }
    return {
      consultation: {
        consultationId: active.id,
        queueItemId: active.queueItemId ?? null,
        appointmentId: active.appointmentId ?? null,
        status: active.status,
      },
    };
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
