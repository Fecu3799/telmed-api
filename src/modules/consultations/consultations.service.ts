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

/**
 * Core de consultas (appointment -> consultation, read/patch/close, active)
 * - Crear consulta asociada a un appointment, validar acceso, editar notas/resumen, cerrar consulta
 *   y marcar efectos colaterales (queue + appointment)
 *
 * How it works:
 * - createForAppointment: valida appointment existente + status (scheduled/confirmed), valida ownership si actor es doctor
 *   y crea consulta única por appointmentId (maneja race con P2002).
 * - getById: incluye queueItem (info mínima), y aplica ownership (doctor/patient).
 * - patch: bloquea si closed; permite solo doctor/admin; actualiza summary/notes.
 * - close: idempotente si ya está closed; setea closedAt, lastActivityAt, summary/notes final;
 *   si venia de queue marca queueItem.closedAt; si venia de appointment marca appointment completed.
 * - getActiveForActor: busca última in_progress del actor.
 *
 * Key points:
 * - Admin no está bloqueado en ConsultationService.getById, pero el controller lo devuelve con vista reducida.
 */

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
        lastActivityAt: new Date(),
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

    if (consultation.appointmentId) {
      await this.prisma.appointment.update({
        where: { id: consultation.appointmentId },
        data: { status: AppointmentStatus.completed },
      });
    }

    return updated;
  }

  async getActiveForActor(actor: Actor) {
    if (actor.role !== UserRole.doctor && actor.role !== UserRole.patient) {
      throw new ForbiddenException('Forbidden');
    }

    return this.prisma.consultation.findFirst({
      where: {
        status: ConsultationStatus.in_progress,
        ...(actor.role === UserRole.doctor
          ? { doctorUserId: actor.id }
          : { patientUserId: actor.id }),
      },
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        queueItemId: true,
        appointmentId: true,
        status: true,
      },
    });
  }
}
