import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { ListDoctorPatientsQueryDto } from './dto/list-doctor-patients-query.dto';
import { PatientSummaryDto } from './docs/patient-summary.dto';
import { DoctorPatientsResponseDto } from './docs/doctor-patients-response.dto';
import { ConsultationStatus, AppointmentStatus } from '@prisma/client';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

@Injectable()
export class DoctorPatientsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPatients(
    doctorUserId: string,
    query: ListDoctorPatientsQueryDto,
  ): Promise<DoctorPatientsResponseDto> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const skip = (page - 1) * limit;

    // Get consultations with status='closed' for this doctor
    const consultations = await this.prisma.consultation.findMany({
      where: {
        doctorUserId,
        status: ConsultationStatus.closed,
      },
      select: {
        patientUserId: true,
        closedAt: true,
      },
    });

    // Get appointments with status in ['completed', 'confirmed'] OR with closed consultation
    const appointments = await this.prisma.appointment.findMany({
      where: {
        doctorUserId,
        OR: [
          {
            status: {
              in: [AppointmentStatus.completed, AppointmentStatus.confirmed],
            },
          },
          {
            consultation: {
              status: ConsultationStatus.closed,
            },
          },
        ],
      },
      select: {
        patient: {
          select: {
            userId: true,
          },
        },
        startAt: true,
        consultation: {
          select: {
            closedAt: true,
          },
        },
      },
    });

    // Build map of patientUserId -> lastInteractionAt
    const patientInteractions = new Map<
      string,
      {
        lastInteractionAt: Date;
        lastAppointmentAt: Date | null;
        lastConsultationAt: Date | null;
      }
    >();

    // Process consultations
    for (const consultation of consultations) {
      if (!consultation.closedAt) continue;
      const existing = patientInteractions.get(consultation.patientUserId);
      if (!existing || consultation.closedAt > existing.lastInteractionAt) {
        patientInteractions.set(consultation.patientUserId, {
          lastInteractionAt: consultation.closedAt,
          lastAppointmentAt: null,
          lastConsultationAt: consultation.closedAt,
        });
      } else if (
        existing.lastConsultationAt === null ||
        consultation.closedAt > existing.lastConsultationAt
      ) {
        existing.lastConsultationAt = consultation.closedAt;
        if (consultation.closedAt > existing.lastInteractionAt) {
          existing.lastInteractionAt = consultation.closedAt;
        }
      }
    }

    // Process appointments
    for (const appointment of appointments) {
      const patientUserId = appointment.patient.userId;
      const consultationClosedAt = appointment.consultation?.closedAt;
      const interactionDate = consultationClosedAt || appointment.startAt;
      const existing = patientInteractions.get(patientUserId);

      if (!existing || interactionDate > existing.lastInteractionAt) {
        patientInteractions.set(patientUserId, {
          lastInteractionAt: interactionDate,
          lastAppointmentAt: appointment.startAt,
          lastConsultationAt: consultationClosedAt || null,
        });
      } else {
        // Update existing entry
        if (
          existing.lastAppointmentAt === null ||
          appointment.startAt > existing.lastAppointmentAt
        ) {
          existing.lastAppointmentAt = appointment.startAt;
        }
        if (
          consultationClosedAt &&
          (existing.lastConsultationAt === null ||
            consultationClosedAt > existing.lastConsultationAt)
        ) {
          existing.lastConsultationAt = consultationClosedAt;
        }
        if (interactionDate > existing.lastInteractionAt) {
          existing.lastInteractionAt = interactionDate;
        }
      }
    }

    // Get unique patient user IDs
    const patientUserIds = Array.from(patientInteractions.keys());

    if (patientUserIds.length === 0) {
      return {
        items: [],
        pageInfo: {
          page,
          limit,
          total: 0,
          hasNextPage: false,
          hasPrevPage: false,
        },
      };
    }

    // Get patient and user data
    const patients = await this.prisma.patient.findMany({
      where: {
        userId: {
          in: patientUserIds,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    // Build patient summaries
    let summaries: PatientSummaryDto[] = patients.map((patient) => {
      const interaction = patientInteractions.get(patient.userId)!;
      return {
        id: patient.userId,
        fullName: `${patient.legalFirstName} ${patient.legalLastName}`,
        email: patient.user.email,
        lastInteractionAt: interaction.lastInteractionAt.toISOString(),
        lastAppointmentAt: interaction.lastAppointmentAt
          ? interaction.lastAppointmentAt.toISOString()
          : null,
        lastConsultationAt: interaction.lastConsultationAt
          ? interaction.lastConsultationAt.toISOString()
          : null,
      };
    });

    // Apply search filter if provided
    if (query.q) {
      const searchLower = query.q.toLowerCase();
      summaries = summaries.filter(
        (p) =>
          p.fullName.toLowerCase().includes(searchLower) ||
          p.email?.toLowerCase().includes(searchLower),
      );
    }

    // Sort by lastInteractionAt descending
    summaries.sort(
      (a, b) =>
        new Date(b.lastInteractionAt).getTime() -
        new Date(a.lastInteractionAt).getTime(),
    );

    const total = summaries.length;
    const paginated = summaries.slice(skip, skip + limit);

    return {
      items: paginated,
      pageInfo: {
        page,
        limit,
        total,
        hasNextPage: skip + limit < total,
        hasPrevPage: page > 1,
      },
    };
  }
}
