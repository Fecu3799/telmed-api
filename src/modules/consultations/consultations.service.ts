import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AppointmentStatus,
  ConsultationStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { Actor } from '../../common/types/actor.type';
import { ConsultationPatchDto } from './dto/consultation-patch.dto';

@Injectable()
export class ConsultationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createForAppointment(actor: Actor, appointmentId: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { patient: { select: { userId: true } } },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    if (
      appointment.status !== AppointmentStatus.scheduled &&
      appointment.status !== AppointmentStatus.confirmed
    ) {
      throw new ConflictException('Appointment is not confirmed');
    }

    if (actor.role === UserRole.doctor) {
      if (appointment.doctorUserId !== actor.id) {
        throw new ForbiddenException('Forbidden');
      }
    }

    const existing = await this.prisma.consultation.findUnique({
      where: { appointmentId },
    });

    if (existing) {
      return { consultation: existing, created: false };
    }

    try {
      const consultation = await this.prisma.consultation.create({
        data: {
          appointmentId,
          doctorUserId: appointment.doctorUserId,
          patientUserId: appointment.patient.userId,
        },
      });
      return { consultation, created: true };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const consultation = await this.prisma.consultation.findUniqueOrThrow({
          where: { appointmentId },
        });
        return { consultation, created: false };
      }
      throw error;
    }
  }

  async getById(actor: Actor, id: string) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id },
      include: {
        queueItem: {
          select: {
            id: true,
            entryType: true,
            reason: true,
            paymentStatus: true,
            appointmentId: true,
          },
        },
      },
    });

    if (!consultation) {
      throw new NotFoundException('Consultation not found');
    }

    if (actor.role === UserRole.doctor) {
      if (consultation.doctorUserId !== actor.id) {
        throw new ForbiddenException('Forbidden');
      }
    } else if (actor.role === UserRole.patient) {
      if (consultation.patientUserId !== actor.id) {
        throw new ForbiddenException('Forbidden');
      }
    }

    return consultation;
  }

  async patch(actor: Actor, id: string, dto: ConsultationPatchDto) {
    const consultation = await this.getById(actor, id);

    if (consultation.status === ConsultationStatus.closed) {
      throw new ConflictException('Consultation already closed');
    }

    if (actor.role !== UserRole.admin && actor.role !== UserRole.doctor) {
      throw new ForbiddenException('Forbidden');
    }

    return this.prisma.consultation.update({
      where: { id },
      data: {
        summary: dto.summary ?? null,
        notes: dto.notes ?? null,
      },
    });
  }

  async start(actor: Actor, id: string) {
    const consultation = await this.getById(actor, id);

    if (consultation.status === ConsultationStatus.closed) {
      throw new ConflictException('Consultation already closed');
    }

    if (actor.role !== UserRole.admin && actor.role !== UserRole.doctor) {
      throw new ForbiddenException('Forbidden');
    }

    if (consultation.status === ConsultationStatus.in_progress) {
      return consultation;
    }

    return this.prisma.consultation.update({
      where: { id },
      data: {
        status: ConsultationStatus.in_progress,
        startedAt: consultation.startedAt ?? new Date(),
      },
    });
  }

  async close(actor: Actor, id: string, dto?: ConsultationPatchDto) {
    const consultation = await this.getById(actor, id);

    if (consultation.status === ConsultationStatus.closed) {
      return consultation;
    }

    if (actor.role !== UserRole.admin && actor.role !== UserRole.doctor) {
      throw new ForbiddenException('Forbidden');
    }

    const updated = await this.prisma.consultation.update({
      where: { id },
      data: {
        status: ConsultationStatus.closed,
        closedAt: consultation.closedAt ?? new Date(),
        summary: dto?.summary ?? consultation.summary ?? null,
        notes: dto?.notes ?? consultation.notes ?? null,
      },
    });

    if (consultation.queueItem?.id) {
      await this.prisma.consultationQueueItem.update({
        where: { id: consultation.queueItem.id },
        data: { closedAt: new Date() },
      });
    }

    return updated;
  }
}
