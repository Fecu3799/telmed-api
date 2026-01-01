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
import { AdminAppointmentsQueryDto } from './dto/admin-appointments-query.dto';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ListAppointmentsQueryDto } from './dto/list-appointments-query.dto';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityService: DoctorAvailabilityService,
    private readonly paymentsService: PaymentsService,
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

    const patientProfile = await this.prisma.patientProfile.findUnique({
      where: { userId: patientUserId },
      select: { userId: true },
    });
    if (!patientProfile) {
      throw new NotFoundException('Patient not found');
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
        });
      if (
        existingAppointment.doctorUserId !== doctorUserId ||
        existingAppointment.patientUserId !== patientUserId
      ) {
        throw new ConflictException('Idempotency key already used');
      }
      return {
        appointment: existingAppointment,
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
            patientUserId,
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

    return {
      appointment,
      payment: this.toPaymentResponse(payment),
    };
  }

  async listPatientAppointments(actor: Actor, query: ListAppointmentsQueryDto) {
    await this.paymentsService.expirePendingAppointmentPayments({
      patientUserId: actor.id,
    });
    const { from, to } = this.parseRange(query.from, query.to);
    const { page, limit, skip } = this.resolvePaging(query.page, query.limit);

    const where = {
      patientUserId: actor.id,
      startAt: { gte: from, lte: to },
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.appointment.findMany({
        where,
        orderBy: { startAt: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.appointment.count({ where }),
    ]);

    return this.buildPage(items, total, page, limit);
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
      }),
      this.prisma.appointment.count({ where }),
    ]);

    return this.buildPage(items, total, page, limit);
  }

  async listAdminAppointments(query: AdminAppointmentsQueryDto) {
    await this.paymentsService.expirePendingAppointmentPayments({});
    const { from, to } = this.parseRange(query.from, query.to);
    const { page, limit, skip } = this.resolvePaging(query.page, query.limit);

    const where = {
      startAt: { gte: from, lte: to },
      ...(query.doctorUserId ? { doctorUserId: query.doctorUserId } : {}),
      ...(query.patientUserId ? { patientUserId: query.patientUserId } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.appointment.findMany({
        where,
        orderBy: { startAt: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.appointment.count({ where }),
    ]);

    return this.buildPage(items, total, page, limit);
  }

  async cancelAppointment(actor: Actor, id: string, dto: CancelAppointmentDto) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    if (actor.role === UserRole.patient) {
      if (appointment.patientUserId !== actor.id) {
        throw new ForbiddenException('Forbidden');
      }
    } else if (actor.role === UserRole.doctor) {
      if (appointment.doctorUserId !== actor.id) {
        throw new ForbiddenException('Forbidden');
      }
    }

    return this.prisma.appointment.update({
      where: { id },
      data: {
        status: AppointmentStatus.cancelled,
        cancelledAt: this.clock.now(),
        cancellationReason: dto.reason ?? null,
      },
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
