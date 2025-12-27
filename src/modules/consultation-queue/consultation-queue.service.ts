import {
  ConflictException,
  ForbiddenException,
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
import { CancelQueueDto } from './dto/cancel-queue.dto';
import { CreateQueueDto } from './dto/create-queue.dto';
import { FinalizeConsultationDto } from './dto/finalize-consultation.dto';
import { RejectQueueDto } from './dto/reject-queue.dto';

@Injectable()
export class ConsultationQueueService {
  constructor(private readonly prisma: PrismaService) {}

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

    return this.prisma.consultationQueueItem.create({
      data: {
        status: ConsultationQueueStatus.queued,
        doctorUserId,
        patientUserId,
        appointmentId: dto.appointmentId ?? null,
        createdBy: actor.id,
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

    return queue;
  }

  async acceptQueue(actor: Actor, queueId: string) {
    const queue = await this.getQueueById(actor, queueId);

    if (queue.status !== ConsultationQueueStatus.queued) {
      throw new ConflictException('Queue status invalid');
    }

    return this.prisma.consultationQueueItem.update({
      where: { id: queueId },
      data: {
        status: ConsultationQueueStatus.accepted,
        acceptedAt: new Date(),
        acceptedBy: actor.id,
      },
    });
  }

  async rejectQueue(actor: Actor, queueId: string, dto: RejectQueueDto) {
    const queue = await this.getQueueById(actor, queueId);

    if (queue.status !== ConsultationQueueStatus.queued) {
      throw new ConflictException('Queue status invalid');
    }

    return this.prisma.consultationQueueItem.update({
      where: { id: queueId },
      data: {
        status: ConsultationQueueStatus.rejected,
        rejectedAt: new Date(),
        reason: dto.reason ?? null,
      },
    });
  }

  async cancelQueue(actor: Actor, queueId: string, dto: CancelQueueDto) {
    const queue = await this.getQueueById(actor, queueId);

    if (
      queue.status !== ConsultationQueueStatus.queued &&
      queue.status !== ConsultationQueueStatus.accepted
    ) {
      throw new ConflictException('Queue status invalid');
    }

    return this.prisma.consultationQueueItem.update({
      where: { id: queueId },
      data: {
        status: ConsultationQueueStatus.cancelled,
        cancelledAt: new Date(),
        cancelledBy: actor.id,
        reason: dto.reason ?? null,
      },
    });
  }

  startFromQueue(actor: Actor, queueId: string) {
    throw new NotImplementedException(
      'Consultation start from queue not implemented',
    );
  }

  finalizeConsultation(
    actor: Actor,
    consultationId: string,
    dto: FinalizeConsultationDto,
  ) {
    throw new NotImplementedException('Consultation finalize not implemented');
  }
}
