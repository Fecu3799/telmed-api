import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AppointmentStatus, UserRole } from '@prisma/client';
import { DoctorAvailabilityService } from '../doctors/availability/doctor-availability.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CLOCK, type Clock } from '../../common/clock/clock';
import type { Actor } from '../../common/types/actor.type';
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
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async createAppointment(actor: Actor, dto: CreateAppointmentDto) {
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
      select: { userId: true, isActive: true },
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

    return this.prisma.$transaction(async (tx) => {
      const overlap = await tx.appointment.findFirst({
        where: {
          doctorUserId,
          status: AppointmentStatus.scheduled,
          startAt: { lt: endAt },
          endAt: { gt: startAt },
        },
        select: { id: true },
      });

      if (overlap) {
        throw new ConflictException('Appointment overlaps');
      }

      return tx.appointment.create({
        data: {
          doctorUserId,
          patientUserId,
          startAt,
          endAt,
        },
      });
    });
  }

  async listPatientAppointments(actor: Actor, query: ListAppointmentsQueryDto) {
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
}
