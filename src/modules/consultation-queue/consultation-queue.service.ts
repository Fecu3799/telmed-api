import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  NotImplementedException,
} from '@nestjs/common';
import {
  AppointmentStatus,
  ConsultationQueueEntryType,
  ConsultationQueuePaymentStatus,
  ConsultationQueueStatus,
  ConsultationStatus,
  PaymentKind,
  PaymentProvider,
  PaymentStatus,
  UserRole,
} from '@prisma/client';
import type { Actor } from '../../common/types/actor.type';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CLOCK, type Clock } from '../../common/clock/clock';
import { PaymentsService } from '../payments/payments.service';
import { CancelQueueDto } from './dto/cancel-queue.dto';
import { CreateQueueDto } from './dto/create-queue.dto';
import { FinalizeConsultationDto } from './dto/finalize-consultation.dto';
import { RejectQueueDto } from './dto/reject-queue.dto';

@Injectable()
export class ConsultationQueueService {
  private readonly paymentTtlMinutes = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async createQueue(actor: Actor, dto: CreateQueueDto) {
    let doctorUserId = dto.doctorUserId;
    let patientUserId = dto.patientUserId;
    // Entry type is derived from appointment presence, never from input.
    const entryType = dto.appointmentId
      ? ConsultationQueueEntryType.appointment
      : ConsultationQueueEntryType.emergency;

    if (actor.role === UserRole.patient) {
      patientUserId = actor.id;
    } else if (actor.role === UserRole.doctor) {
      doctorUserId = actor.id;
    }

    if (!patientUserId) {
      throw new UnprocessableEntityException('patientUserId is required');
    }

    if (entryType === ConsultationQueueEntryType.emergency && !dto.reason) {
      throw new UnprocessableEntityException('reason is required');
    }

    const doctorProfile = await this.prisma.doctorProfile.findUnique({
      where: { userId: doctorUserId },
      select: { userId: true },
    });
    if (!doctorProfile) {
      throw new NotFoundException('Doctor not found');
    }

    const patientIdentity = await this.prisma.patient.findUnique({
      where: { userId: patientUserId },
      select: { userId: true },
    });
    if (!patientIdentity) {
      throw new NotFoundException('Patient not found');
    }

    let appointmentReason: string | null = null;
    if (dto.appointmentId) {
      const appointment = await this.prisma.appointment.findUnique({
        where: { id: dto.appointmentId },
        select: {
          id: true,
          doctorUserId: true,
          status: true,
          startAt: true,
          reason: true,
          patient: { select: { userId: true } },
        },
      });

      if (!appointment) {
        throw new NotFoundException('Appointment not found');
      }

      if (
        appointment.doctorUserId !== doctorUserId ||
        appointment.patient.userId !== patientUserId
      ) {
        throw new UnprocessableEntityException(
          'Appointment does not match doctor/patient',
        );
      }

      if (
        appointment.status !== AppointmentStatus.scheduled &&
        appointment.status !== AppointmentStatus.confirmed
      ) {
        throw new ConflictException('Appointment not confirmed');
      }
      appointmentReason = appointment.reason ?? null;

      const now = this.clock.now();
      const startAt = appointment.startAt;

      const windowStart = new Date(startAt.getTime() - 15 * 60 * 1000);
      const windowEnd = new Date(startAt.getTime() + 15 * 60 * 1000);

      if (now < windowStart || now > windowEnd) {
        throw new UnprocessableEntityException(
          'Waiting room not available for this appointment time',
        );
      }

      const existing = await this.prisma.consultationQueueItem.findFirst({
        where: {
          appointmentId: dto.appointmentId,
          status: {
            in: [
              ConsultationQueueStatus.queued,
              ConsultationQueueStatus.accepted,
            ],
          },
          closedAt: null,
        },
        select: { id: true },
      });

      if (existing) {
        throw new ConflictException('Queue already exists');
      }
    } else {
      const existing = await this.prisma.consultationQueueItem.findFirst({
        where: {
          doctorUserId,
          patientUserId,
          appointmentId: null,
          status: {
            in: [
              ConsultationQueueStatus.queued,
              ConsultationQueueStatus.accepted,
            ],
          },
          closedAt: null,
        },
        select: { id: true },
      });

      if (existing) {
        throw new ConflictException('Queue already exists');
      }
    }

    const queuedAt = this.clock.now();
    const expiresAt = new Date(queuedAt.getTime() + 15 * 60 * 1000);
    const paymentStatus =
      entryType === ConsultationQueueEntryType.appointment
        ? ConsultationQueuePaymentStatus.not_required
        : ConsultationQueuePaymentStatus.not_started;
    const reason =
      entryType === ConsultationQueueEntryType.appointment
        ? (dto.reason ?? appointmentReason ?? null)
        : (dto.reason ?? null);

    return this.prisma.consultationQueueItem.create({
      data: {
        status: ConsultationQueueStatus.queued,
        entryType,
        doctorUserId,
        patientUserId,
        appointmentId: dto.appointmentId ?? null,
        paymentStatus,
        reason,
        createdBy: actor.id,
        queuedAt,
        expiresAt,
      },
    });
  }

  async getQueueById(actor: Actor, id: string) {
    const queue = await this.prisma.consultationQueueItem.findUnique({
      where: { id },
    });

    if (!queue) {
      throw new NotFoundException('Queue not found');
    }

    if (actor.role === UserRole.patient) {
      if (queue.patientUserId !== actor.id) {
        throw new ForbiddenException('Forbidden');
      }
    } else if (actor.role === UserRole.doctor) {
      if (queue.doctorUserId !== actor.id) {
        throw new ForbiddenException('Forbidden');
      }
    }

    await this.expireQueueById(id);
    const paymentUpdated = await this.expirePendingPaymentIfNeeded(queue);
    const updated = await this.prisma.consultationQueueItem.findUnique({
      where: { id },
    });
    if (!updated) {
      throw new NotFoundException('Queue not found');
    }
    return paymentUpdated ?? updated;
  }

  async acceptQueue(actor: Actor, queueItemId: string) {
    const queue = await this.getQueueById(actor, queueItemId);
    const paymentExpired = await this.expirePendingPaymentIfNeeded(queue);
    if (
      paymentExpired?.paymentStatus === ConsultationQueuePaymentStatus.expired
    ) {
      throw new ConflictException('Payment window expired');
    }

    if (queue.entryType !== ConsultationQueueEntryType.emergency) {
      throw new ConflictException('Accept is only allowed for emergencies');
    }

    if (queue.status !== ConsultationQueueStatus.queued) {
      throw new ConflictException('Queue status invalid');
    }

    if (queue.paymentStatus !== ConsultationQueuePaymentStatus.not_started) {
      throw new ConflictException('Payment already initialized');
    }

    return this.prisma.consultationQueueItem.update({
      where: { id: queueItemId },
      data: {
        status: ConsultationQueueStatus.accepted,
        acceptedAt: this.clock.now(),
        acceptedBy: actor.id,
        paymentStatus: ConsultationQueuePaymentStatus.pending,
        paymentExpiresAt: this.buildPaymentExpiry(),
      },
    });
  }

  async rejectQueue(actor: Actor, queueItemId: string, dto: RejectQueueDto) {
    const queue = await this.getQueueById(actor, queueItemId);

    if (
      queue.status !== ConsultationQueueStatus.queued &&
      queue.status !== ConsultationQueueStatus.expired
    ) {
      throw new ConflictException('Queue status invalid');
    }

    return this.prisma.consultationQueueItem.update({
      where: { id: queueItemId },
      data: {
        status: ConsultationQueueStatus.rejected,
        rejectedAt: this.clock.now(),
        rejectedBy: actor.id,
        reason: dto.reason ?? null,
      },
    });
  }

  async cancelQueue(actor: Actor, queueItemId: string, dto: CancelQueueDto) {
    const queue = await this.getQueueById(actor, queueItemId);

    if (queue.status !== ConsultationQueueStatus.queued) {
      throw new ConflictException('Queue status invalid');
    }

    return this.prisma.consultationQueueItem.update({
      where: { id: queueItemId },
      data: {
        status: ConsultationQueueStatus.cancelled,
        cancelledAt: this.clock.now(),
        cancelledBy: actor.id,
        reason: dto.reason ?? null,
      },
    });
  }

  async requestPaymentForQueue(
    actor: Actor,
    queueItemId: string,
    idempotencyKey?: string | null,
  ) {
    let queue = await this.getQueueById(actor, queueItemId);

    if (queue.entryType !== ConsultationQueueEntryType.emergency) {
      throw new ConflictException('Payment only allowed for emergencies');
    }

    if (queue.status !== ConsultationQueueStatus.accepted) {
      throw new ConflictException('Queue status invalid');
    }

    if (queue.paymentStatus !== ConsultationQueuePaymentStatus.pending) {
      throw new ConflictException('Payment not enabled');
    }

    const expired = await this.expirePendingPaymentIfNeeded(queue);
    if (expired) {
      queue = expired;
    }
    if (queue.paymentStatus === ConsultationQueuePaymentStatus.expired) {
      throw new ConflictException('Payment window expired');
    }

    const doctorProfile = await this.prisma.doctorProfile.findUnique({
      where: { userId: queue.doctorUserId },
      select: { priceCents: true, currency: true },
    });

    if (!doctorProfile) {
      throw new NotFoundException('Doctor not found');
    }

    const existingPayment = await this.paymentsService.findIdempotentPayment(
      queue.patientUserId,
      PaymentKind.emergency,
      idempotencyKey,
    );

    if (existingPayment) {
      if (
        existingPayment.queueItemId &&
        existingPayment.queueItemId !== queue.id
      ) {
        throw new ConflictException('Idempotency key already used');
      }
      return this.toPaymentResponse(existingPayment);
    }

    const queuePayment = await this.prisma.payment.findFirst({
      where: {
        queueItemId: queue.id,
        kind: PaymentKind.emergency,
        status: { in: [PaymentStatus.pending, PaymentStatus.paid] },
      },
    });
    if (queuePayment) {
      if (queuePayment.status === PaymentStatus.paid) {
        throw new ConflictException('Payment already completed');
      }
      return this.toPaymentResponse(queuePayment);
    }

    const preference =
      await this.paymentsService.createEmergencyPaymentPreference({
        doctorUserId: queue.doctorUserId,
        patientUserId: queue.patientUserId,
        queueItemId: queue.id,
        amountCents: doctorProfile.priceCents,
        currency: doctorProfile.currency,
        idempotencyKey,
      });

    const payment = await this.prisma.$transaction(async (tx) => {
      const createdPayment = await tx.payment.create({
        data: {
          id: preference.paymentId,
          provider: PaymentProvider.mercadopago,
          kind: PaymentKind.emergency,
          status: PaymentStatus.pending,
          amountCents: doctorProfile.priceCents,
          currency: doctorProfile.currency,
          doctorUserId: queue.doctorUserId,
          patientUserId: queue.patientUserId,
          appointmentId: null,
          queueItemId: queue.id,
          checkoutUrl: preference.checkoutUrl,
          providerPreferenceId: preference.providerPreferenceId,
          idempotencyKey: idempotencyKey ?? null,
          expiresAt: preference.expiresAt,
        },
      });

      await tx.consultationQueueItem.update({
        where: { id: queue.id },
        data: {
          paymentExpiresAt: preference.expiresAt,
        },
      });

      return createdPayment;
    });

    return this.toPaymentResponse(payment);
  }

  async listQueueForAdmin(includeClosed = false) {
    await this.expireQueuedItems();
    const items = await this.prisma.consultationQueueItem.findMany({
      where: {
        status: {
          in: [
            ConsultationQueueStatus.accepted,
            ConsultationQueueStatus.queued,
            ConsultationQueueStatus.expired,
          ],
        },
        ...(includeClosed ? {} : { closedAt: null }),
      },
      include: { appointment: true },
    });
    return this.sortQueueItems(items);
  }

  async listQueueForDoctor(actor: Actor, includeClosed = false) {
    await this.expireQueuedItems(actor.id);
    const items = await this.prisma.consultationQueueItem.findMany({
      where: {
        doctorUserId: actor.id,
        status: {
          in: [
            ConsultationQueueStatus.accepted,
            ConsultationQueueStatus.queued,
            ConsultationQueueStatus.expired,
          ],
        },
        ...(includeClosed ? {} : { closedAt: null }),
      },
      include: { appointment: true },
    });
    return this.sortQueueItems(items);
  }

  async startFromQueue(actor: Actor, queueItemId: string) {
    let queue = await this.getQueueById(actor, queueItemId);

    if (actor.role === UserRole.doctor && queue.doctorUserId !== actor.id) {
      throw new ForbiddenException('Forbidden');
    }

    if (
      queue.status === ConsultationQueueStatus.cancelled ||
      queue.status === ConsultationQueueStatus.rejected ||
      queue.status === ConsultationQueueStatus.expired
    ) {
      throw new ConflictException('Queue status invalid');
    }

    const expired = await this.expirePendingPaymentIfNeeded(queue);
    if (expired) {
      queue = expired;
    }

    if (queue.paymentStatus === ConsultationQueuePaymentStatus.expired) {
      throw new ConflictException('Payment window expired');
    }

    const isAppointmentEntry =
      queue.entryType === ConsultationQueueEntryType.appointment;

    if (!isAppointmentEntry && queue.appointmentId) {
      throw new ConflictException('Emergency queue cannot have appointment');
    }

    if (!isAppointmentEntry) {
      if (queue.status !== ConsultationQueueStatus.accepted) {
        throw new ConflictException('Queue not accepted');
      }
      if (queue.paymentStatus !== ConsultationQueuePaymentStatus.paid) {
        throw new ConflictException('Payment required');
      }
    } else {
      if (queue.paymentStatus !== ConsultationQueuePaymentStatus.not_required) {
        throw new ConflictException('Payment status invalid');
      }
      if (!queue.appointmentId) {
        throw new ConflictException('Appointment is required');
      }
      const appointment = await this.prisma.appointment.findUnique({
        where: { id: queue.appointmentId },
        select: {
          doctorUserId: true,
          patient: { select: { userId: true } },
        },
      });
      if (
        !appointment ||
        appointment.doctorUserId !== queue.doctorUserId ||
        appointment.patient.userId !== queue.patientUserId
      ) {
        throw new ConflictException('Appointment does not match queue');
      }
    }

    let updatedQueue = queue;
    if (!queue.acceptedAt) {
      updatedQueue = await this.prisma.consultationQueueItem.update({
        where: { id: queue.id },
        data: {
          acceptedAt: this.clock.now(),
          acceptedBy: actor.id,
          status:
            queue.status === ConsultationQueueStatus.queued
              ? ConsultationQueueStatus.accepted
              : queue.status,
        },
      });
    }

    const existing = await this.prisma.consultation.findUnique({
      where: isAppointmentEntry
        ? { appointmentId: queue.appointmentId ?? '' }
        : { queueItemId: queue.id },
    });

    if (existing) {
      if (existing.status === ConsultationStatus.closed) {
        throw new ConflictException('Consultation already closed');
      }
      if (existing.status !== ConsultationStatus.in_progress) {
        const resumed = await this.prisma.consultation.update({
          where: { id: existing.id },
          data: {
            status: ConsultationStatus.in_progress,
            startedAt: existing.startedAt ?? this.clock.now(),
            lastActivityAt: this.clock.now(),
          },
        });
        return this.toStartResponse(updatedQueue, resumed);
      }
      return this.toStartResponse(updatedQueue, existing);
    }

    const consultationData: {
      doctorUserId: string;
      patientUserId: string;
      status: ConsultationStatus;
      startedAt: Date;
      appointmentId?: string | null;
      queueItemId?: string | null;
      lastActivityAt?: Date;
    } = {
      doctorUserId: queue.doctorUserId,
      patientUserId: queue.patientUserId,
      status: ConsultationStatus.in_progress,
      startedAt: this.clock.now(),
      lastActivityAt: this.clock.now(),
    };

    if (isAppointmentEntry) {
      consultationData.appointmentId = queue.appointmentId ?? null;
    } else {
      consultationData.queueItemId = queue.id;
    }

    const consultation = await this.prisma.consultation.create({
      data: consultationData,
    });

    return this.toStartResponse(updatedQueue, consultation);
  }

  finalizeConsultation(
    _actor: Actor,
    _consultationId: string,
    _dto: FinalizeConsultationDto,
  ) {
    throw new NotImplementedException('Consultation finalize not implemented');
  }

  private buildPaymentExpiry() {
    return new Date(
      this.clock.now().getTime() + this.paymentTtlMinutes * 60 * 1000,
    );
  }

  private async expirePendingPaymentIfNeeded(queue: {
    id: string;
    paymentStatus: ConsultationQueuePaymentStatus;
    paymentExpiresAt: Date | null;
  }) {
    if (
      queue.paymentStatus !== ConsultationQueuePaymentStatus.pending ||
      !queue.paymentExpiresAt
    ) {
      return null;
    }

    if (this.clock.now() <= queue.paymentExpiresAt) {
      return null;
    }

    // Lazy expiration to avoid cron usage.
    return this.prisma.consultationQueueItem.update({
      where: { id: queue.id },
      data: { paymentStatus: ConsultationQueuePaymentStatus.expired },
    });
  }

  private async expireQueueById(id: string) {
    const now = this.clock.now();
    await this.prisma.consultationQueueItem.updateMany({
      where: {
        id,
        status: ConsultationQueueStatus.queued,
        expiresAt: { lte: now },
        closedAt: null,
      },
      data: { status: ConsultationQueueStatus.expired },
    });
  }

  private async expireQueuedItems(doctorUserId?: string) {
    const now = this.clock.now();
    await this.prisma.consultationQueueItem.updateMany({
      where: {
        status: ConsultationQueueStatus.queued,
        expiresAt: { lte: now },
        ...(doctorUserId ? { doctorUserId } : {}),
        closedAt: null,
      },
      data: { status: ConsultationQueueStatus.expired },
    });
  }

  private sortQueueItems(
    items: Array<{
      status: ConsultationQueueStatus;
      appointment: { startAt: Date } | null;
      queuedAt: Date | null;
      createdAt: Date;
    }>,
  ) {
    const now = this.clock.now();
    const withPriority = items.map((item) => {
      const queuedAt = item.queuedAt ?? item.createdAt;
      const appointmentStart = item.appointment?.startAt ?? null;
      const isOnTime =
        appointmentStart &&
        now >= new Date(appointmentStart.getTime() - 15 * 60 * 1000) &&
        now <= new Date(appointmentStart.getTime() + 15 * 60 * 1000);
      const isEarly =
        appointmentStart &&
        now < new Date(appointmentStart.getTime() - 15 * 60 * 1000);

      let priority = 6;
      if (item.status === ConsultationQueueStatus.accepted) {
        priority = 0;
      } else if (item.status === ConsultationQueueStatus.queued) {
        if (appointmentStart && isOnTime) {
          priority = 1;
        } else if (appointmentStart && isEarly) {
          priority = 2;
        } else if (!appointmentStart) {
          priority = 3;
        } else {
          priority = 4;
        }
      } else if (item.status === ConsultationQueueStatus.expired) {
        priority = 5;
      }

      return {
        item,
        priority,
        appointmentStart,
        queuedAt,
      };
    });

    withPriority.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }

      if (a.appointmentStart && b.appointmentStart) {
        const startDiff =
          a.appointmentStart.getTime() - b.appointmentStart.getTime();
        if (startDiff !== 0) {
          return startDiff;
        }
      } else if (a.appointmentStart && !b.appointmentStart) {
        return -1;
      } else if (!a.appointmentStart && b.appointmentStart) {
        return 1;
      }

      return a.queuedAt.getTime() - b.queuedAt.getTime();
    });

    return withPriority.map((entry) => entry.item);
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

  private toStartResponse(
    queueItem: {
      id: string;
      status: ConsultationQueueStatus;
      entryType: ConsultationQueueEntryType;
      appointmentId: string | null;
      reason: string | null;
      paymentStatus: ConsultationQueuePaymentStatus;
      paymentExpiresAt: Date | null;
    },
    consultation: {
      id: string;
      status: ConsultationStatus;
      startedAt: Date | null;
      closedAt: Date | null;
      appointmentId: string | null;
      queueItemId: string | null;
      doctorUserId: string;
      patientUserId: string;
    },
  ) {
    return {
      queueItem,
      consultation,
      // Deterministic placeholder for client-side routing.
      videoUrl: `https://video.telmed.local/consultations/${consultation.id}`,
    };
  }
}
