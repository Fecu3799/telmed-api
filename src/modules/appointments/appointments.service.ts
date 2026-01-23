import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  AppointmentStatus,
  PaymentKind,
  PaymentProvider,
  PaymentStatus,
  UserRole,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { DoctorAvailabilityService } from '../doctors/availability/doctor-availability.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CLOCK, type Clock } from '../../common/clock/clock';
import type { Actor } from '../../common/types/actor.type';
import { PaymentsService } from '../payments/payments.service';
import { PatientsIdentityService } from '../patients-identity/patients-identity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AdminAppointmentsQueryDto } from './dto/admin-appointments-query.dto';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ListAppointmentsQueryDto } from './dto/list-appointments-query.dto';

/**
 * Core de turnos + ventana de pago
 * - Implementa el flujo completo de turnos: validación, cálculo de slot, chequeo de solapamiento,
 *   creación de appointment + payment, listado por rol, reintento de pago y cancelación.
 *
 * How it works:
 * - createAppointment
 *   - Valida doctor activo y paciente con identidad completa.
 *   - Resuelve endAt según DoctorAvailabilityService.getSchedulingConfig y valida disponibilidad.
 *   - Maneja idempotencia: si ya existe payment con esa key/kind, devuelve el appointment/payment asociado.
 *   - Crea preferencia de pago (MP) y en una transacción:
 *     - verifica solapamiento con otros appointments activos (pending_payment/confirmed/scheduled).
 *     - crea appointment en pending_payment con expiresAt.
 *     - crea payment kind appointment con checkoutUrl, providerPreferenceId, idempotencyKey y expiresAt.
 *   - Notifica a doctor y paciente (notification.appointmentsChanged).
 * - listPatient/listDoctor/listAdmin
 *   - Antes de listar, expira payments pending_payment con paymentsService.expirePendingAppointmentPayments.
 *   - Filtra por rango from/to y pagina 1-based (limit cap 50).
 *   - Para paciente, traduce patientUserId -> patientId usando PatientsIdentityService.
 * - requestPaymentForAppointment
 *   - Solo patient/admin y valida ownership si es patient.
 *   - Solo permite pagar si status=pending_payment; si la ventana venció, cancela appointment y devuelve 409.
 *   - Idempotencia: si existe payment por key o payment pending/paid para el appointment, lo reutiliza; si paid -> 409.
 *   - Si necesita crear uno nuevo, crea preferencia MP + payment y actualiza appointment.paymentExpiresAt.
 * - cancelAppointment
 *   - Valida ownership según rol; setea cancelled + cancelledAt + cancellationReason; notifica a ambos.
 *
 * Key points:
 * - Reglas fuertes: sin identidad completa no se puede reservar.
 * - Ventana de pago: si expira, el turno se cancela al intentar pagar/listar
 * - La respuesta normaliza patientUserId aunque DB guarde patientId
 */

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityService: DoctorAvailabilityService,
    private readonly paymentsService: PaymentsService,
    private readonly patientsIdentityService: PatientsIdentityService,
    private readonly notifications: NotificationsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async createAppointment(
    actor: Actor,
    dto: CreateAppointmentDto,
    idempotencyKey?: string | null,
  ) {
    const startAt = this.parseDateTime(dto.startAt);
    const doctorUserId = dto.doctorUserId;

    let patientUserId = dto.patientUserId;
    if (actor.role === UserRole.patient) {
      if (dto.patientUserId) {
        throw new UnprocessableEntityException(
          'patientUserId is not allowed for patient',
        );
      }
      patientUserId = actor.id;
    } else if (actor.role === UserRole.admin) {
      if (!dto.patientUserId) {
        throw new UnprocessableEntityException('patientUserId is required');
      }
      patientUserId = dto.patientUserId;
    }

    if (!patientUserId) {
      throw new UnprocessableEntityException('patientUserId is required');
    }

    const doctorProfile = await this.prisma.doctorProfile.findUnique({
      where: { userId: doctorUserId },
      select: {
        userId: true,
        isActive: true,
        priceCents: true,
        currency: true,
      },
    });
    if (!doctorProfile || !doctorProfile.isActive) {
      throw new NotFoundException('Doctor not found');
    }

    const identityStatus =
      await this.patientsIdentityService.getIdentityStatus(patientUserId);
    if (!identityStatus.exists || !identityStatus.isComplete) {
      // Patients must complete identity before booking appointments.
      throw new ConflictException('Patient identity is incomplete');
    }

    const existingPayment = await this.paymentsService.findIdempotentPayment(
      patientUserId,
      PaymentKind.appointment,
      idempotencyKey,
    );
    if (existingPayment) {
      if (!existingPayment.appointmentId) {
        throw new ConflictException('Idempotency key already used');
      }
      const existingAppointment =
        await this.prisma.appointment.findUniqueOrThrow({
          where: { id: existingPayment.appointmentId },
          include: { patient: { select: { userId: true } } },
        });
      if (
        existingAppointment.doctorUserId !== doctorUserId ||
        existingAppointment.patient.userId !== patientUserId
      ) {
        throw new ConflictException('Idempotency key already used');
      }
      return {
        appointment: this.toAppointmentResponse(existingAppointment),
        payment: this.toPaymentResponse(existingPayment),
      };
    }

    const config =
      await this.availabilityService.getSchedulingConfig(doctorUserId);
    const endAt = new Date(
      startAt.getTime() + config.slotDurationMinutes * 60 * 1000,
    );

    await this.availabilityService.assertSlotAvailable(
      doctorUserId,
      startAt,
      endAt,
    );

    const appointmentId = randomUUID();

    const preference =
      await this.paymentsService.createAppointmentPaymentPreference({
        doctorUserId,
        patientUserId,
        appointmentId,
        amountCents: doctorProfile.priceCents,
        currency: doctorProfile.currency,
        idempotencyKey,
      });

    const [appointment, payment] = await this.prisma.$transaction(
      async (tx) => {
        const overlap = await tx.appointment.findFirst({
          where: {
            doctorUserId,
            status: {
              in: [
                AppointmentStatus.pending_payment,
                AppointmentStatus.confirmed,
                AppointmentStatus.scheduled,
              ],
            },
            startAt: { lt: endAt },
            endAt: { gt: startAt },
          },
          select: { id: true },
        });

        if (overlap) {
          throw new ConflictException('Appointment overlaps');
        }

        const createdAppointment = await tx.appointment.create({
          data: {
            id: appointmentId,
            doctorUserId,
            patientId: identityStatus.patientId!,
            startAt,
            endAt,
            status: AppointmentStatus.pending_payment,
            paymentExpiresAt: preference.expiresAt,
            reason: dto.reason ?? null,
          },
        });

        // Payment.kind invariants: appointment must reference appointmentId only.
        const createdPayment = await tx.payment.create({
          data: {
            id: preference.paymentId,
            provider: PaymentProvider.mercadopago,
            kind: PaymentKind.appointment,
            status: PaymentStatus.pending,
            amountCents: doctorProfile.priceCents,
            currency: doctorProfile.currency,
            doctorUserId,
            patientUserId,
            appointmentId: appointmentId,
            queueItemId: null,
            checkoutUrl: preference.checkoutUrl,
            providerPreferenceId: preference.providerPreferenceId,
            idempotencyKey: idempotencyKey ?? null,
            expiresAt: preference.expiresAt,
          },
        });

        return [createdAppointment, createdPayment] as const;
      },
    );

    const response = {
      appointment: this.toAppointmentResponse({
        ...appointment,
        patientUserId,
      }),
      payment: this.toPaymentResponse(payment),
    };

    // Notify both doctor and patient about new appointment.
    this.notifications.appointmentsChanged([doctorUserId, patientUserId]);

    return response;
  }

  async listPatientAppointments(actor: Actor, query: ListAppointmentsQueryDto) {
    await this.paymentsService.expirePendingAppointmentPayments({
      patientUserId: actor.id,
    });
    const { from, to } = this.parseRange(query.from, query.to);
    const { page, limit, skip } = this.resolvePaging(query.page, query.limit);
    const identityStatus = await this.patientsIdentityService.getIdentityStatus(
      actor.id,
    );
    if (!identityStatus.exists) {
      return this.buildPage([], 0, page, limit);
    }

    const where = {
      patientId: identityStatus.patientId!,
      startAt: { gte: from, lte: to },
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.appointment.findMany({
        where,
        orderBy: { startAt: 'asc' },
        skip,
        take: limit,
        include: { patient: { select: { userId: true } } },
      }),
      this.prisma.appointment.count({ where }),
    ]);

    return this.buildPage(
      items.map((item) => this.toAppointmentResponse(item)),
      total,
      page,
      limit,
    );
  }

  async listDoctorAppointments(actor: Actor, query: ListAppointmentsQueryDto) {
    await this.paymentsService.expirePendingAppointmentPayments({
      doctorUserId: actor.id,
    });
    const { from, to } = this.parseRange(query.from, query.to);
    const { page, limit, skip } = this.resolvePaging(query.page, query.limit);

    const where = {
      doctorUserId: actor.id,
      startAt: { gte: from, lte: to },
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.appointment.findMany({
        where,
        orderBy: { startAt: 'asc' },
        skip,
        take: limit,
        include: { patient: { select: { userId: true } } },
      }),
      this.prisma.appointment.count({ where }),
    ]);

    return this.buildPage(
      items.map((item) => this.toAppointmentResponse(item)),
      total,
      page,
      limit,
    );
  }

  async listAdminAppointments(query: AdminAppointmentsQueryDto) {
    await this.paymentsService.expirePendingAppointmentPayments({});
    const { from, to } = this.parseRange(query.from, query.to);
    const { page, limit, skip } = this.resolvePaging(query.page, query.limit);

    let patientIdFilter: string | undefined;
    if (query.patientUserId) {
      const status = await this.patientsIdentityService.getIdentityStatus(
        query.patientUserId,
      );
      if (status.exists) {
        patientIdFilter = status.patientId ?? undefined;
      } else {
        return this.buildPage([], 0, page, limit);
      }
    }
    const where = {
      startAt: { gte: from, lte: to },
      ...(query.doctorUserId ? { doctorUserId: query.doctorUserId } : {}),
      ...(patientIdFilter ? { patientId: patientIdFilter } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.appointment.findMany({
        where,
        orderBy: { startAt: 'asc' },
        skip,
        take: limit,
        include: { patient: { select: { userId: true } } },
      }),
      this.prisma.appointment.count({ where }),
    ]);

    return this.buildPage(
      items.map((item) => this.toAppointmentResponse(item)),
      total,
      page,
      limit,
    );
  }

  async requestPaymentForAppointment(
    actor: Actor,
    appointmentId: string,
    idempotencyKey?: string | null,
  ) {
    if (actor.role !== UserRole.patient && actor.role !== UserRole.admin) {
      throw new ForbiddenException('Forbidden');
    }

    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { patient: { select: { userId: true } } },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    // Verify ownership (patient or admin)
    if (actor.role === UserRole.patient) {
      if (appointment.patient.userId !== actor.id) {
        throw new ForbiddenException('Forbidden');
      }
    }

    // Verify appointment is in a payable state
    if (appointment.status !== AppointmentStatus.pending_payment) {
      throw new ConflictException('Appointment is not in a payable state');
    }

    // Check if payment window expired
    if (
      appointment.paymentExpiresAt &&
      this.clock.now() > appointment.paymentExpiresAt
    ) {
      // Expire the appointment
      await this.prisma.appointment.update({
        where: { id: appointmentId },
        data: {
          status: AppointmentStatus.cancelled,
          cancelledAt: this.clock.now(),
        },
      });
      throw new ConflictException('Payment window expired');
    }

    const doctorProfile = await this.prisma.doctorProfile.findUnique({
      where: { userId: appointment.doctorUserId },
      select: { priceCents: true, currency: true },
    });

    if (!doctorProfile) {
      throw new NotFoundException('Doctor not found');
    }

    // Check for idempotent payment
    const existingPayment = await this.paymentsService.findIdempotentPayment(
      appointment.patient.userId,
      PaymentKind.appointment,
      idempotencyKey,
    );

    if (existingPayment) {
      if (
        existingPayment.appointmentId &&
        existingPayment.appointmentId !== appointmentId
      ) {
        throw new ConflictException('Idempotency key already used');
      }
      if (existingPayment.status === PaymentStatus.paid) {
        throw new ConflictException('Payment already completed');
      }
      return this.toPaymentResponse(existingPayment);
    }

    // Check for existing payment for this appointment
    const appointmentPayment = await this.prisma.payment.findFirst({
      where: {
        appointmentId: appointment.id,
        kind: PaymentKind.appointment,
        status: { in: [PaymentStatus.pending, PaymentStatus.paid] },
      },
    });

    if (appointmentPayment) {
      if (appointmentPayment.status === PaymentStatus.paid) {
        throw new ConflictException('Payment already completed');
      }
      return this.toPaymentResponse(appointmentPayment);
    }

    // Create new payment preference
    const preference =
      await this.paymentsService.createAppointmentPaymentPreference({
        doctorUserId: appointment.doctorUserId,
        patientUserId: appointment.patient.userId,
        appointmentId: appointment.id,
        amountCents: doctorProfile.priceCents,
        currency: doctorProfile.currency,
        idempotencyKey,
      });

    const payment = await this.prisma.$transaction(async (tx) => {
      const createdPayment = await tx.payment.create({
        data: {
          id: preference.paymentId,
          provider: PaymentProvider.mercadopago,
          kind: PaymentKind.appointment,
          status: PaymentStatus.pending,
          amountCents: doctorProfile.priceCents,
          currency: doctorProfile.currency,
          doctorUserId: appointment.doctorUserId,
          patientUserId: appointment.patient.userId,
          appointmentId: appointment.id,
          queueItemId: null,
          checkoutUrl: preference.checkoutUrl,
          providerPreferenceId: preference.providerPreferenceId,
          idempotencyKey: idempotencyKey ?? null,
          expiresAt: preference.expiresAt,
        },
      });

      await tx.appointment.update({
        where: { id: appointment.id },
        data: {
          paymentExpiresAt: preference.expiresAt,
        },
      });

      return createdPayment;
    });

    return this.toPaymentResponse(payment);
  }

  async cancelAppointment(actor: Actor, id: string, dto: CancelAppointmentDto) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: { patient: { select: { userId: true } } },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    if (actor.role === UserRole.patient) {
      if (appointment.patient.userId !== actor.id) {
        throw new ForbiddenException('Forbidden');
      }
    } else if (actor.role === UserRole.doctor) {
      if (appointment.doctorUserId !== actor.id) {
        throw new ForbiddenException('Forbidden');
      }
    }

    const updated = await this.prisma.appointment.update({
      where: { id },
      data: {
        status: AppointmentStatus.cancelled,
        cancelledAt: this.clock.now(),
        cancellationReason: dto.reason ?? null,
      },
    });

    // Notify both doctor and patient about appointment changes.
    this.notifications.appointmentsChanged([
      appointment.doctorUserId,
      appointment.patient.userId,
    ]);

    return this.toAppointmentResponse({
      ...updated,
      patientUserId: appointment.patient.userId,
    });
  }

  private parseDateTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new UnprocessableEntityException('Invalid datetime');
    }
    return date;
  }

  private parseRange(from: string, to: string) {
    const fromDate = this.parseDateTime(from);
    const toDate = this.parseDateTime(to);
    if (fromDate >= toDate) {
      throw new UnprocessableEntityException('from must be before to');
    }
    return { from: fromDate, to: toDate };
  }

  private toAppointmentResponse(appointment: Record<string, unknown>) {
    const patient =
      'patient' in appointment
        ? (appointment.patient as { userId: string })
        : null;
    const patientUserId =
      patient?.userId ??
      (appointment.patientUserId as string | undefined) ??
      '';
    const { patient: _patient, patientId: _patientId, ...rest } = appointment;
    return { ...rest, patientUserId };
  }

  private resolvePaging(page?: number, limit?: number) {
    const resolvedLimit = Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const resolvedPage = page ?? 1;
    const skip = (resolvedPage - 1) * resolvedLimit;
    return { page: resolvedPage, limit: resolvedLimit, skip };
  }

  private buildPage<T>(items: T[], total: number, page: number, limit: number) {
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    return {
      items,
      pageInfo: {
        page,
        limit,
        total,
        hasNextPage,
        hasPrevPage,
      },
    };
  }

  private toPaymentResponse(payment: {
    id: string;
    checkoutUrl: string;
    expiresAt: Date;
    status: string;
  }) {
    return {
      id: payment.id,
      checkoutUrl: payment.checkoutUrl,
      expiresAt: payment.expiresAt,
      status: payment.status,
    };
  }
}
