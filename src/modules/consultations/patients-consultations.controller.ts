import { Controller, Get, Query, UseGuards } from '@nestjs/common';
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
import { ProblemDetailsDto } from '../../common/docs/problem-details.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { Actor } from '../../common/types/actor.type';
import { ConsultationHistoryResponseDto } from './docs/consultation-history.dto';
import { ConsultationHistoryQueryDto } from './dto/consultation-history-query.dto';
import { ConsultationsService } from './consultations.service';

/**
 * Patient consultations history.
 * What it does:
 * - Lists consultations for the authenticated patient with pagination and filters.
 * How it works:
 * - Delegates to ConsultationsService for data access and response mapping.
 * Gotchas:
 * - Date filters apply to consultation createdAt and require from/to together.
 */
@ApiTags('patients')
@Controller('patients/me/consultations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.patient)
@ApiBearerAuth('access-token')
export class PatientsConsultationsController {
  constructor(private readonly consultationsService: ConsultationsService) {}

  @Get()
  @ApiOperation({ summary: 'List patient consultations' })
  @ApiOkResponse({ type: ConsultationHistoryResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async listPatientConsultations(
    @CurrentUser() actor: Actor,
    @Query() query: ConsultationHistoryQueryDto,
  ) {
    return this.consultationsService.listPatientConsultations(actor, query);
  }
}
