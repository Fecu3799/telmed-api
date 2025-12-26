import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
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
import { ConsultationDto } from './docs/consultation.dto';
import { ConsultationsService } from './consultations.service';
import { ConsultationPatchDto } from './dto/consultation-patch.dto';

@ApiTags('consultations')
@Controller()
export class ConsultationsController {
  constructor(private readonly consultationsService: ConsultationsService) {}

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
  async get(@CurrentUser() actor: Actor, @Param('id') id: string) {
    return this.consultationsService.getById(actor, id);
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
    return this.consultationsService.patch(actor, id, dto);
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
    return this.consultationsService.start(actor, id);
  }

  @Post('consultations/:id/close')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.doctor, UserRole.admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Close consultation' })
  @ApiOkResponse({ type: ConsultationDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  @HttpCode(HttpStatus.OK)
  async close(@CurrentUser() actor: Actor, @Param('id') id: string) {
    return this.consultationsService.close(actor, id);
  }
}
