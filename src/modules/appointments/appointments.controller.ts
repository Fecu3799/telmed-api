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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { UserRole } from '@prisma/client';
import { ProblemDetailsDto } from '../../common/docs/problem-details.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { Actor } from '../../common/types/actor.type';
import { AppointmentDto } from './docs/appointment.dto';
import { AppointmentWithPaymentDto } from './docs/appointment-payment.dto';
import { AppointmentsResponseDto } from './docs/appointments-response.dto';
import { PaymentCheckoutDto } from '../payments/docs/payment.dto';
import { AppointmentsService } from './appointments.service';
import { AdminAppointmentsQueryDto } from './dto/admin-appointments-query.dto';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ListAppointmentsQueryDto } from './dto/list-appointments-query.dto';
import { AuditService } from '../../infra/audit/audit.service';
import { AuditAction } from '@prisma/client';

/**
 * Booking + list + pay + cancel appointments
 * - Expone la API para crear turnos, listar turnos por rol, pedir checkout de pago
 *   y cancelar turnos, con validaciones y restricciones de negocio.
 *
 * How it works:
 * - POST /appointments (patient/admin): crea appointment con Idempotency-Key opcional.
 * - GET /patients/me/appointments / /doctors/me/appointments: lista por actor con paginación + rango from/to.
 * - GET /admin/appointments: lista global con filtros admin.
 * - POST /appointments/:id/pay: genera/recupera checkout de MercadoPago solo si el turno está pending_payment.
 * - POST /appointments/:id/cancel: cancela turno (patient/doctor/admin) y guarda motivo.
 */

@ApiTags('appointments')
@Controller()
export class AppointmentsController {
  constructor(
    private readonly appointmentsService: AppointmentsService,
    private readonly auditService: AuditService,
  ) {}

  @Post('appointments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.patient, UserRole.admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Create appointment',
    description: 'Requires patient identity to be complete before booking.',
  })
  @ApiBody({ type: CreateAppointmentDto })
  @ApiCreatedResponse({ type: AppointmentWithPaymentDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async create(
    @CurrentUser() actor: Actor,
    @Body() dto: CreateAppointmentDto,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ) {
    return this.appointmentsService.createAppointment(
      actor,
      dto,
      idempotencyKey,
    );
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

  @Post('appointments/:id/pay')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.patient, UserRole.admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Request payment checkout for appointment',
    description:
      'Creates or retrieves payment checkout URL for an existing appointment. Only available for appointments in pending_payment status.',
  })
  @ApiOkResponse({ type: PaymentCheckoutDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async payAppointment(
    @CurrentUser() actor: Actor,
    @Param('id') id: string,
    @Headers('Idempotency-Key') idempotencyKey?: string,
    @Req() req?: Request,
  ) {
    const payment = await this.appointmentsService.requestPaymentForAppointment(
      actor,
      id,
      idempotencyKey,
    );
    // Audit payment creation for appointment flows
    await this.auditService.log({
      action: AuditAction.WRITE,
      resourceType: 'Payment',
      resourceId: payment.id,
      actor,
      traceId: (req as Request & { traceId?: string })?.traceId ?? null,
      ip: req?.ip,
      userAgent: req?.get('user-agent') ?? null,
      metadata: { appointmentId: id },
    });
    return payment;
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
