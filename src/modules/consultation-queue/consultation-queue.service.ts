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
  ConsultationQueueStatus,
  UserRole,
} from '@prisma/client';
import type { Actor } from '../../common/types/actor.type';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CLOCK, type Clock } from '../../common/clock/clock';
import { CancelQueueDto } from './dto/cancel-queue.dto';
import { CreateQueueDto } from './dto/create-queue.dto';
import { FinalizeConsultationDto } from './dto/finalize-consultation.dto';
import { RejectQueueDto } from './dto/reject-queue.dto';

@Injectable()
export class ConsultationQueueService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async createQueue(actor: Actor, dto: CreateQueueDto) {
    let doctorUserId = dto.doctorUserId;
    let patientUserId = dto.patientUserId;

    if (actor.role === UserRole.patient) {
      patientUserId = actor.id;
    } else if (actor.role === UserRole.doctor) {
      doctorUserId = actor.id;
    }

    if (!patientUserId) {
      throw new UnprocessableEntityException('patientUserId is required');
    }

    const doctorProfile = await this.prisma.doctorProfile.findUnique({
      where: { userId: doctorUserId },
      select: { userId: true },
    });
    if (!doctorProfile) {
      throw new NotFoundException('Doctor not found');
    }

    const patientProfile = await this.prisma.patientProfile.findUnique({
      where: { userId: patientUserId },
      select: { userId: true },
    });
    if (!patientProfile) {
      throw new NotFoundException('Patient not found');
    }

    if (dto.appointmentId) {
      const appointment = await this.prisma.appointment.findUnique({
        where: { id: dto.appointmentId },
      });

      if (!appointment) {
        throw new NotFoundException('Appointment not found');
      }

      if (
        appointment.doctorUserId !== doctorUserId ||
        appointment.patientUserId !== patientUserId
      ) {
        throw new UnprocessableEntityException(
          'Appointment does not match doctor/patient',
        );
      }

      if (appointment.status !== AppointmentStatus.scheduled) {
        throw new ConflictException('Appointment not scheduled');
      }

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
          status: {
            in: [
              ConsultationQueueStatus.queued,
              ConsultationQueueStatus.accepted,
            ],
          },
        },
        select: { id: true },
      });

      if (existing) {
        throw new ConflictException('Queue already exists');
      }
    }

    const queuedAt = this.clock.now();
    const expiresAt = new Date(queuedAt.getTime() + 15 * 60 * 1000);

    return this.prisma.consultationQueueItem.create({
      data: {
        status: ConsultationQueueStatus.queued,
        doctorUserId,
        patientUserId,
        appointmentId: dto.appointmentId ?? null,
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
    const updated = await this.prisma.consultationQueueItem.findUnique({
      where: { id },
    });
    if (!updated) {
      throw new NotFoundException('Queue not found');
    }
    return updated;
  }

  async acceptQueue(actor: Actor, queueId: string) {
    const queue = await this.getQueueById(actor, queueId);

    if (
      queue.status !== ConsultationQueueStatus.queued &&
      queue.status !== ConsultationQueueStatus.expired
    ) {
      throw new ConflictException('Queue status invalid');
    }

    return this.prisma.consultationQueueItem.update({
      where: { id: queueId },
      data: {
        status: ConsultationQueueStatus.accepted,
        acceptedAt: this.clock.now(),
        acceptedBy: actor.id,
      },
    });
  }

  async rejectQueue(actor: Actor, queueId: string, dto: RejectQueueDto) {
    const queue = await this.getQueueById(actor, queueId);

    if (
      queue.status !== ConsultationQueueStatus.queued &&
      queue.status !== ConsultationQueueStatus.expired
    ) {
      throw new ConflictException('Queue status invalid');
    }

    return this.prisma.consultationQueueItem.update({
      where: { id: queueId },
      data: {
        status: ConsultationQueueStatus.rejected,
        rejectedAt: this.clock.now(),
        rejectedBy: actor.id,
        reason: dto.reason ?? null,
      },
    });
  }

  async cancelQueue(actor: Actor, queueId: string, dto: CancelQueueDto) {
    const queue = await this.getQueueById(actor, queueId);

    if (queue.status !== ConsultationQueueStatus.queued) {
      throw new ConflictException('Queue status invalid');
    }

    return this.prisma.consultationQueueItem.update({
      where: { id: queueId },
      data: {
        status: ConsultationQueueStatus.cancelled,
        cancelledAt: this.clock.now(),
        cancelledBy: actor.id,
        reason: dto.reason ?? null,
      },
    });
  }

  async listQueueForAdmin() {
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
      },
      include: { appointment: true },
    });
    return this.sortQueueItems(items);
  }

  async listQueueForDoctor(actor: Actor) {
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
      },
      include: { appointment: true },
    });
    return this.sortQueueItems(items);
  }

  startFromQueue(_actor: Actor, _queueId: string) {
    throw new NotImplementedException(
      'Consultation start from queue not implemented',
    );
  }

  finalizeConsultation(
    _actor: Actor,
    _consultationId: string,
    _dto: FinalizeConsultationDto,
  ) {
    throw new NotImplementedException('Consultation finalize not implemented');
  }

  private async expireQueueById(id: string) {
    const now = this.clock.now();
    await this.prisma.consultationQueueItem.updateMany({
      where: {
        id,
        status: ConsultationQueueStatus.queued,
        expiresAt: { lte: now },
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
}
