import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ProblemDetailsDto } from '../../common/docs/problem-details.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { Actor } from '../../common/types/actor.type';
import { AppointmentDto } from './docs/appointment.dto';
import { AppointmentsResponseDto } from './docs/appointments-response.dto';
import { AppointmentsService } from './appointments.service';
import { AdminAppointmentsQueryDto } from './dto/admin-appointments-query.dto';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ListAppointmentsQueryDto } from './dto/list-appointments-query.dto';

@ApiTags('appointments')
@Controller()
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post('appointments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.patient, UserRole.admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create appointment' })
  @ApiBody({ type: CreateAppointmentDto })
  @ApiCreatedResponse({ type: AppointmentDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async create(@CurrentUser() actor: Actor, @Body() dto: CreateAppointmentDto) {
    return this.appointmentsService.createAppointment(actor, dto);
  }

  @Get('patients/me/appointments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.patient)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List patient appointments' })
  @ApiOkResponse({ type: AppointmentsResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async listPatient(
    @CurrentUser() actor: Actor,
    @Query() query: ListAppointmentsQueryDto,
  ) {
    return this.appointmentsService.listPatientAppointments(actor, query);
  }

  @Get('doctors/me/appointments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.doctor)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List doctor appointments' })
  @ApiOkResponse({ type: AppointmentsResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async listDoctor(
    @CurrentUser() actor: Actor,
    @Query() query: ListAppointmentsQueryDto,
  ) {
    return this.appointmentsService.listDoctorAppointments(actor, query);
  }

  @Get('admin/appointments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List appointments (admin)' })
  @ApiOkResponse({ type: AppointmentsResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async listAdmin(@Query() query: AdminAppointmentsQueryDto) {
    return this.appointmentsService.listAdminAppointments(query);
  }

  @Post('appointments/:id/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.patient, UserRole.doctor, UserRole.admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Cancel appointment' })
  @ApiBody({ type: CancelAppointmentDto })
  @ApiOkResponse({ type: AppointmentDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async cancel(
    @CurrentUser() actor: Actor,
    @Param('id') id: string,
    @Body() dto: CancelAppointmentDto,
  ) {
    return this.appointmentsService.cancelAppointment(actor, id, dto);
  }
}
