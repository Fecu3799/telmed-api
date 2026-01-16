import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
  NotImplementedException,
  forwardRef,
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
import type { ConsultationEventsPublisher } from '../consultations/consultation-events-publisher.interface';
import { LiveKitService } from '../consultations/livekit.service';
import { getTraceId } from '../../common/request-context';
import { CancelQueueDto } from './dto/cancel-queue.dto';
import { CreateQueueDto } from './dto/create-queue.dto';
import { FinalizeConsultationDto } from './dto/finalize-consultation.dto';
import { RejectQueueDto } from './dto/reject-queue.dto';
import { GeoEmergencyCoordinator } from '../geo/geo-emergency-coordinator.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ConsultationQueueService {
  private readonly paymentTtlMinutes = 10;
  private readonly logger = new Logger(ConsultationQueueService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService,
    @Inject('ConsultationEventsPublisher')
    private readonly eventsPublisher: ConsultationEventsPublisher,
    @Inject(forwardRef(() => LiveKitService))
    private readonly livekitService: LiveKitService,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly geoEmergencyCoordinator: GeoEmergencyCoordinator,
    private readonly notifications: NotificationsService,
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

    const geoClaim =
      await this.geoEmergencyCoordinator.reserveAcceptance(queueItemId);

    try {
      const updated = await this.prisma.consultationQueueItem.update({
        where: { id: queueItemId },
        data: {
          status: ConsultationQueueStatus.accepted,
          acceptedAt: this.clock.now(),
          acceptedBy: actor.id,
          paymentStatus: ConsultationQueuePaymentStatus.pending,
          paymentExpiresAt: this.buildPaymentExpiry(),
        },
      });

      if (geoClaim) {
        await this.geoEmergencyCoordinator.finalizeAcceptance(
          geoClaim,
          updated.id,
          actor.id,
        );
      }

      // Notify doctor and patient about emergency status change.
      this.notifications.emergenciesChanged([
        updated.doctorUserId,
        updated.patientUserId,
      ]);

      return updated;
    } catch (error) {
      if (geoClaim) {
        await this.geoEmergencyCoordinator.releaseAcceptance(geoClaim);
      }
      throw error;
    }
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

  async listEmergenciesForDoctor(
    actor: Actor,
    options: {
      page?: number;
      pageSize?: number;
      status?: ConsultationQueueStatus;
    },
  ) {
    await this.expireQueuedItems(actor.id);
    return this.listEmergencies({
      where: {
        doctorUserId: actor.id,
      },
      actor,
      ...options,
    });
  }

  async listEmergenciesForPatient(
    actor: Actor,
    options: {
      page?: number;
      pageSize?: number;
      status?: ConsultationQueueStatus;
    },
  ) {
    await this.expireQueuedItems();
    return this.listEmergencies({
      where: {
        patientUserId: actor.id,
      },
      actor,
      ...options,
    });
  }

  async startFromQueue(
    actor: Actor,
    queueItemId: string,
    traceId?: string | null,
  ) {
    // Log before validation
    this.logger.log(
      JSON.stringify({
        event: 'start_from_queue_begin',
        queueItemId,
        actorUserId: actor.id,
        actorRole: actor.role,
        traceId: traceId ?? null,
      }),
    );

    let queue = await this.getQueueById(actor, queueItemId);

    if (actor.role === UserRole.doctor && queue.doctorUserId !== actor.id) {
      this.logger.warn(
        JSON.stringify({
          event: 'start_from_queue_forbidden',
          queueItemId,
          actorUserId: actor.id,
          actorRole: actor.role,
          queueDoctorUserId: queue.doctorUserId,
          reason: 'Doctor does not own queue item',
          traceId: traceId ?? null,
        }),
      );
      throw new ForbiddenException('Forbidden');
    }

    if (
      queue.status === ConsultationQueueStatus.cancelled ||
      queue.status === ConsultationQueueStatus.rejected ||
      queue.status === ConsultationQueueStatus.expired
    ) {
      this.logger.warn(
        JSON.stringify({
          event: 'start_from_queue_invalid_status',
          queueItemId,
          queueStatus: queue.status,
          actorUserId: actor.id,
          actorRole: actor.role,
          reason: 'Queue status invalid',
          traceId: traceId ?? null,
        }),
      );
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
        this.logger.warn(
          JSON.stringify({
            event: 'start_from_queue_consultation_closed',
            queueItemId,
            consultationId: existing.id,
            actorUserId: actor.id,
            actorRole: actor.role,
            reason: 'Consultation already closed',
            traceId: traceId ?? null,
          }),
        );
        throw new ConflictException('Consultation already closed');
      }
      if (existing.status !== ConsultationStatus.in_progress) {
        // Log before DB update
        this.logger.log(
          JSON.stringify({
            event: 'start_from_queue_resuming_consultation',
            queueItemId,
            consultationId: existing.id,
            previousStatus: existing.status,
            actorUserId: actor.id,
            actorRole: actor.role,
            traceId: traceId ?? null,
          }),
        );

        const resumed = await this.prisma.consultation.update({
          where: { id: existing.id },
          data: {
            status: ConsultationStatus.in_progress,
            startedAt: existing.startedAt ?? this.clock.now(),
            lastActivityAt: this.clock.now(),
          },
        });

        // Log after DB update
        this.logger.log(
          JSON.stringify({
            event: 'start_from_queue_consultation_resumed',
            queueItemId: updatedQueue.id,
            consultationId: resumed.id,
            consultationStatus: resumed.status,
            queueStatus: updatedQueue.status,
            actorUserId: actor.id,
            actorRole: actor.role,
            traceId: traceId ?? null,
          }),
        );

        // Publish consultation.started event (non-blocking, wrapped in try/catch)
        // This notifies waiting patients that the consultation is ready
        const roomName = resumed.videoRoomName ?? `consultation_${resumed.id}`;
        try {
          const livekitUrl = this.livekitService.getLivekitUrl();
          this.eventsPublisher.consultationStarted({
            queueItemId: updatedQueue.id,
            consultationId: resumed.id,
            roomName,
            livekitUrl,
            startedAt: resumed.startedAt ?? this.clock.now(),
            traceId: traceId ?? getTraceId(),
          });
        } catch (error) {
          // Log but don't fail: event publishing is non-critical
          // The consultation is already persisted, so we return success
          this.logger.warn(
            JSON.stringify({
              event: 'consultation_started_event_publish_failed',
              queueItemId: updatedQueue.id,
              consultationId: resumed.id,
              traceId: traceId ?? getTraceId() ?? null,
              error:
                error instanceof Error
                  ? { message: error.message, stack: error.stack }
                  : String(error),
            }),
          );
        }

        if (!isAppointmentEntry) {
          this.notifications.emergenciesChanged([
            updatedQueue.doctorUserId,
            updatedQueue.patientUserId,
          ]);
        }

        this.notifications.consultationsChanged([
          updatedQueue.doctorUserId,
          updatedQueue.patientUserId,
        ]);

        return this.toStartResponse(updatedQueue, resumed);
      }
      // Idempotency: consultation already in_progress, don't emit event again
      this.logger.log(
        JSON.stringify({
          event: 'start_from_queue_idempotent',
          queueItemId,
          consultationId: existing.id,
          consultationStatus: existing.status,
          actorUserId: actor.id,
          actorRole: actor.role,
          traceId: traceId ?? null,
        }),
      );
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

    // Log before DB create
    this.logger.log(
      JSON.stringify({
        event: 'start_from_queue_creating_consultation',
        queueItemId: updatedQueue.id,
        queueStatus: updatedQueue.status,
        actorUserId: actor.id,
        actorRole: actor.role,
        traceId: traceId ?? null,
      }),
    );

    const consultation = await this.prisma.consultation.create({
      data: consultationData,
    });

    // Log after DB create
    this.logger.log(
      JSON.stringify({
        event: 'start_from_queue_consultation_created',
        queueItemId: updatedQueue.id,
        consultationId: consultation.id,
        consultationStatus: consultation.status,
        queueStatus: updatedQueue.status,
        actorUserId: actor.id,
        actorRole: actor.role,
        traceId: traceId ?? null,
      }),
    );

    // Publish consultation.started event (non-blocking, wrapped in try/catch)
    // This notifies waiting patients that the consultation is ready
    const roomName =
      consultation.videoRoomName ?? `consultation_${consultation.id}`;
    try {
      const livekitUrl = this.livekitService.getLivekitUrl();
      this.eventsPublisher.consultationStarted({
        queueItemId: updatedQueue.id,
        consultationId: consultation.id,
        roomName,
        livekitUrl,
        startedAt: consultation.startedAt ?? this.clock.now(),
        traceId: traceId ?? getTraceId(),
      });
    } catch (error) {
      // Log but don't fail: event publishing is non-critical
      // The consultation is already persisted, so we return success
      this.logger.warn(
        JSON.stringify({
          event: 'consultation_started_event_publish_failed',
          queueItemId: updatedQueue.id,
          consultationId: consultation.id,
          traceId: traceId ?? getTraceId() ?? null,
          error:
            error instanceof Error
              ? { message: error.message, stack: error.stack }
              : String(error),
        }),
      );
    }

    if (!isAppointmentEntry) {
      this.notifications.emergenciesChanged([
        updatedQueue.doctorUserId,
        updatedQueue.patientUserId,
      ]);
    }

    this.notifications.consultationsChanged([
      updatedQueue.doctorUserId,
      updatedQueue.patientUserId,
    ]);

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

  private resolvePaging(page?: number, pageSize?: number) {
    const resolvedPage = page ?? 1;
    const resolvedPageSize = Math.min(pageSize ?? 20, 50);
    const skip = (resolvedPage - 1) * resolvedPageSize;
    return { page: resolvedPage, pageSize: resolvedPageSize, skip };
  }

  private async listEmergencies(options: {
    where: { doctorUserId?: string; patientUserId?: string };
    actor: Actor;
    page?: number;
    pageSize?: number;
    status?: ConsultationQueueStatus;
  }) {
    const { page, pageSize, skip } = this.resolvePaging(
      options.page,
      options.pageSize,
    );

    const where = {
      ...options.where,
      entryType: ConsultationQueueEntryType.emergency,
      ...(options.status ? { status: options.status } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.consultationQueueItem.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: { consultation: { select: { id: true, status: true } } },
      }),
      this.prisma.consultationQueueItem.count({ where }),
    ]);

    const doctorIds = Array.from(
      new Set(items.map((item) => item.doctorUserId)),
    );
    const patientIds = Array.from(
      new Set(items.map((item) => item.patientUserId)),
    );

    const [users, doctorProfiles, patients] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: [...doctorIds, ...patientIds] } },
        select: { id: true, displayName: true, email: true },
      }),
      this.prisma.doctorProfile.findMany({
        where: { userId: { in: doctorIds } },
        select: {
          userId: true,
          firstName: true,
          lastName: true,
          priceCents: true,
          specialties: {
            include: { specialty: true },
          },
        },
      }),
      this.prisma.patient.findMany({
        where: { userId: { in: patientIds } },
        select: { userId: true, legalFirstName: true, legalLastName: true },
      }),
    ]);

    const userMap = new Map(users.map((user) => [user.id, user]));
    const doctorProfileMap = new Map(
      doctorProfiles.map((profile) => [profile.userId, profile]),
    );
    const patientMap = new Map(
      patients.map((patient) => [patient.userId, patient]),
    );

    const list = items.map((item) => {
      const profile = doctorProfileMap.get(item.doctorUserId);
      const specialty =
        profile?.specialties.find((entry) => entry.specialty.isActive)
          ?.specialty?.name ?? null;
      const counterpartyId =
        item.doctorUserId === options.where.doctorUserId
          ? item.patientUserId
          : item.doctorUserId;
      const counterpartyDisplayName = this.buildDisplayName({
        user: userMap.get(counterpartyId),
        doctorProfile: doctorProfileMap.get(counterpartyId),
        patient: patientMap.get(counterpartyId),
      });
      const consultationStatus = item.consultation?.status ?? null;
      const canStart =
        options.actor.role === UserRole.doctor &&
        item.doctorUserId === options.actor.id &&
        item.status === ConsultationQueueStatus.accepted &&
        item.paymentStatus === ConsultationQueuePaymentStatus.paid &&
        consultationStatus !== ConsultationStatus.in_progress &&
        consultationStatus !== ConsultationStatus.closed;
      return {
        id: item.id,
        queueStatus: item.status,
        paymentStatus: item.paymentStatus,
        canStart,
        createdAt: item.createdAt.toISOString(),
        reason: item.reason ?? null,
        counterparty: {
          id: counterpartyId,
          displayName: counterpartyDisplayName,
        },
        specialty,
        priceCents: profile?.priceCents ?? null,
        consultationId: item.consultation?.id ?? null,
      };
    });

    const hasNextPage = page * pageSize < total;
    return {
      items: list,
      pageInfo: {
        page,
        pageSize,
        total,
        hasNextPage,
        hasPrevPage: page > 1,
      },
    };
  }

  private buildDisplayName(input: {
    user?: { displayName: string | null; email: string } | undefined;
    doctorProfile?:
      | { firstName: string | null; lastName: string | null }
      | undefined;
    patient?: { legalFirstName: string; legalLastName: string } | undefined;
  }) {
    if (input.user?.displayName) {
      return input.user.displayName;
    }
    if (input.doctorProfile?.firstName || input.doctorProfile?.lastName) {
      return `${input.doctorProfile.firstName ?? ''} ${input.doctorProfile.lastName ?? ''}`.trim();
    }
    if (input.patient) {
      return `${input.patient.legalFirstName} ${input.patient.legalLastName}`.trim();
    }
    if (input.user?.email) {
      return input.user.email;
    }
    return 'Usuario';
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
