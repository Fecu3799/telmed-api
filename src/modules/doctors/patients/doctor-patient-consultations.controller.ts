import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
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
import { ProblemDetailsDto } from '../../../common/docs/problem-details.dto';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import type { Actor } from '../../../common/types/actor.type';
import { ConsultationHistoryResponseDto } from '../../consultations/docs/consultation-history.dto';
import { ConsultationHistoryQueryDto } from '../../consultations/dto/consultation-history-query.dto';
import { ConsultationsService } from '../../consultations/consultations.service';
import { DoctorPatientConsultationsParamsDto } from './dto/doctor-patient-consultations-params.dto';

/**
 * Doctor patient consultations history.
 * What it does:
 * - Lists consultations for a doctor and a specific patient with pagination.
 * How it works:
 * - Filters by doctorUserId + patientUserId and maps participants in ConsultationsService.
 * Gotchas:
 * - When no doctor-patient relationship exists, the endpoint returns an empty list.
 */
@ApiTags('doctors')
@Controller('doctor-patients')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.doctor)
@ApiBearerAuth('access-token')
export class DoctorPatientConsultationsController {
  constructor(private readonly consultationsService: ConsultationsService) {}

  @Get(':patientUserId/consultations')
  @ApiOperation({ summary: 'List consultations for a doctor-patient pair' })
  @ApiOkResponse({ type: ConsultationHistoryResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async listDoctorPatientConsultations(
    @CurrentUser() actor: Actor,
    @Param() params: DoctorPatientConsultationsParamsDto,
    @Query() query: ConsultationHistoryQueryDto,
  ) {
    return this.consultationsService.listDoctorPatientConsultations(
      actor,
      params.patientUserId,
      query,
    );
  }
}
