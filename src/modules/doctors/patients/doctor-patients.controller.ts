import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ProblemDetailsDto } from '../../../common/docs/problem-details.dto';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import type { Actor } from '../../../common/types/actor.type';
import { DoctorPatientsResponseDto } from './docs/doctor-patients-response.dto';
import { ListDoctorPatientsQueryDto } from './dto/list-doctor-patients-query.dto';
import { DoctorPatientsService } from './doctor-patients.service';

@ApiTags('doctors')
@Controller('doctors/me')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.doctor)
@ApiBearerAuth('access-token')
export class DoctorPatientsController {
  constructor(private readonly doctorPatientsService: DoctorPatientsService) {}

  @Get('patients')
  @ApiOperation({
    summary: 'List patients with clinical contact',
    description:
      'Returns patients with whom the doctor has had consultations (closed) or completed/confirmed appointments. Results are deduplicated by patient.',
  })
  @ApiOkResponse({ type: DoctorPatientsResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async listPatients(
    @CurrentUser() actor: Actor,
    @Query() query: ListDoctorPatientsQueryDto,
  ) {
    return this.doctorPatientsService.listPatients(actor.id, query);
  }
}
