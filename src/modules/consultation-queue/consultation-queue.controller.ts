import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
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
import { UserRole } from '@prisma/client';
import { ProblemDetailsDto } from '../../common/docs/problem-details.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { Actor } from '../../common/types/actor.type';
import {
  ConsultationDto,
  ConsultationQueueItemDto,
} from './docs/consultation-queue.dto';
import { ConsultationQueueService } from './consultation-queue.service';
import { CancelQueueDto } from './dto/cancel-queue.dto';
import { CreateQueueDto } from './dto/create-queue.dto';
import { FinalizeConsultationDto } from './dto/finalize-consultation.dto';
import { RejectQueueDto } from './dto/reject-queue.dto';

@ApiTags('consultations')
@Controller()
export class ConsultationQueueController {
  constructor(
    private readonly consultationQueueService: ConsultationQueueService,
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
  async createQueue(@CurrentUser() actor: Actor, @Body() dto: CreateQueueDto) {
    return this.consultationQueueService.createQueue(actor, dto);
  }

  @Get('consultations/queue/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.patient, UserRole.doctor, UserRole.admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get queue item' })
  @ApiOkResponse({ type: ConsultationQueueItemDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async getQueue(@CurrentUser() actor: Actor, @Param('id') id: string) {
    return this.consultationQueueService.getQueueById(actor, id);
  }

  @Post('consultations/queue/:queueId/accept')
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
    @Param('queueId') queueId: string,
  ) {
    return this.consultationQueueService.acceptQueue(actor, queueId);
  }

  @Post('consultations/queue/:queueId/reject')
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
    @Param('queueId') queueId: string,
    @Body() dto: RejectQueueDto,
  ) {
    return this.consultationQueueService.rejectQueue(actor, queueId, dto);
  }

  @Post('consultations/queue/:queueId/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.patient, UserRole.admin)
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
    @Param('queueId') queueId: string,
    @Body() dto: CancelQueueDto,
  ) {
    return this.consultationQueueService.cancelQueue(actor, queueId, dto);
  }

  @Post('consultations/from-queue/:queueId/start')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.doctor, UserRole.admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Start consultation from queue' })
  @ApiCreatedResponse({ type: ConsultationDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  startFromQueue(
    @CurrentUser() actor: Actor,
    @Param('queueId') queueId: string,
  ) {
    return this.consultationQueueService.startFromQueue(actor, queueId);
  }

  @Post('consultations/:id/finalize')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.doctor, UserRole.admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Finalize consultation' })
  @ApiBody({ type: FinalizeConsultationDto })
  @ApiOkResponse({ type: ConsultationDto })
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
