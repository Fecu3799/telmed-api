import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  AppointmentStatus,
  ClinicalEpisodeNoteKind,
  ConsultationStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { Actor } from '../../common/types/actor.type';
import { ConsultationPatchDto } from './dto/consultation-patch.dto';
import { ConsultationHistoryQueryDto } from './dto/consultation-history-query.dto';
import { UpsertClinicalEpisodeDraftDto } from './dto/upsert-clinical-episode-draft.dto';
import { SetClinicalEpisodeFormattedDto } from './dto/set-clinical-episode-formatted.dto';
import { CreateClinicalEpisodeAddendumDto } from './dto/create-clinical-episode-addendum.dto';

/**
 * Core de consultas (appointment -> consultation, read/patch/close, history, active).
 * What it does:
 * - Crea consultas asociadas a appointments, valida accesos, edita/cierra y lista historiales.
 * How it works:
 * - createForAppointment: valida appointment existente + status, y crea consulta única por appointmentId.
 * - getById: incluye queueItem (info mínima), y aplica ownership (doctor/patient).
 * - patch/close: bloquea si closed; close setea closedAt y dispara side-effects.
 * - list history: pagina por createdAt desc con filtros status/from/to y batch lookup de hasClinicalFinal.
 * Gotchas:
 * - Los filtros de fecha requieren from+to y se aplican sobre createdAt.
 */

@Injectable()
export class ConsultationsService {
  constructor(private readonly prisma: PrismaService) {}

  private resolvePaging(page?: number, pageSize?: number) {
    const resolvedPage = page ?? 1;
    const resolvedPageSize = Math.min(pageSize ?? 20, 50);
    const skip = (resolvedPage - 1) * resolvedPageSize;
    return { page: resolvedPage, pageSize: resolvedPageSize, skip };
  }

  private parseDateTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new UnprocessableEntityException('Invalid datetime');
    }
    return date;
  }

  private resolveRange(from?: string, to?: string) {
    if (!from && !to) {
      return null;
    }
    if (!from || !to) {
      throw new UnprocessableEntityException(
        'from and to are required together',
      );
    }
    const fromDate = this.parseDateTime(from);
    const toDate = this.parseDateTime(to);
    if (fromDate >= toDate) {
      throw new UnprocessableEntityException('from must be before to');
    }
    return { from: fromDate, to: toDate };
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

  private async listHistory(
    query: ConsultationHistoryQueryDto,
    options: {
      where: Prisma.ConsultationWhereInput;
      includePatient: boolean;
    },
  ) {
    const { page, pageSize, skip } = this.resolvePaging(
      query.page,
      query.pageSize,
    );
    const range = this.resolveRange(query.from, query.to);
    const where: Prisma.ConsultationWhereInput = {
      ...options.where,
      ...(query.status ? { status: query.status } : {}),
      ...(range
        ? {
            createdAt: {
              gte: range.from,
              lte: range.to,
            },
          }
        : {}),
    };

    const [consultations, totalItems] = await this.prisma.$transaction([
      this.prisma.consultation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        select: {
          id: true,
          status: true,
          createdAt: true,
          startedAt: true,
          closedAt: true,
          doctorUserId: true,
          patientUserId: true,
        },
      }),
      this.prisma.consultation.count({ where }),
    ]);

    if (consultations.length === 0) {
      const totalPages =
        totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);
      return {
        items: [],
        pageInfo: {
          page,
          pageSize,
          totalItems,
          totalPages,
          hasNextPage: totalPages > 0 ? page < totalPages : false,
          hasPrevPage: page > 1,
        },
      };
    }

    const consultationIds = consultations.map((item) => item.id);
    const doctorIds = Array.from(
      new Set(consultations.map((item) => item.doctorUserId)),
    );
    const patientIds = Array.from(
      new Set(consultations.map((item) => item.patientUserId)),
    );
    const userIds = Array.from(new Set([...doctorIds, ...patientIds]));

    const [users, doctorProfiles, patients, finalNotes] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, displayName: true, email: true },
      }),
      this.prisma.doctorProfile.findMany({
        where: { userId: { in: doctorIds } },
        select: { userId: true, firstName: true, lastName: true },
      }),
      options.includePatient
        ? this.prisma.patient.findMany({
            where: { userId: { in: patientIds } },
            select: {
              userId: true,
              legalFirstName: true,
              legalLastName: true,
            },
          })
        : Promise.resolve(
            [] as Array<{
              userId: string;
              legalFirstName: string;
              legalLastName: string;
            }>,
          ),
      this.prisma.clinicalEpisodeNote.findMany({
        where: {
          kind: ClinicalEpisodeNoteKind.final,
          deletedAt: null,
          episode: {
            consultationId: { in: consultationIds },
            deletedAt: null,
          },
        },
        select: {
          episode: {
            select: { consultationId: true },
          },
        },
      }),
    ]);

    const userMap = new Map(users.map((user) => [user.id, user]));
    const doctorProfileMap = new Map(
      doctorProfiles.map((profile) => [profile.userId, profile]),
    );
    const patientMap = new Map(
      patients.map((patient) => [patient.userId, patient]),
    );
    const finalMap = new Set(
      finalNotes.map((note) => note.episode.consultationId),
    );

    const items = consultations.map((consultation) => {
      const doctorDisplayName = this.buildDisplayName({
        user: userMap.get(consultation.doctorUserId),
        doctorProfile: doctorProfileMap.get(consultation.doctorUserId),
      });
      const patientDisplayName = options.includePatient
        ? this.buildDisplayName({
            user: userMap.get(consultation.patientUserId),
            patient: patientMap.get(consultation.patientUserId),
          })
        : null;
      return {
        id: consultation.id,
        status: consultation.status,
        createdAt: consultation.createdAt.toISOString(),
        startedAt: consultation.startedAt?.toISOString() ?? null,
        closedAt: consultation.closedAt?.toISOString() ?? null,
        doctor: {
          id: consultation.doctorUserId,
          displayName: doctorDisplayName,
        },
        ...(options.includePatient
          ? {
              patient: {
                id: consultation.patientUserId,
                displayName: patientDisplayName ?? 'Usuario',
              },
            }
          : {}),
        hasClinicalFinal: finalMap.has(consultation.id),
      };
    });

    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);

    return {
      items,
      pageInfo: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasNextPage: totalPages > 0 ? page < totalPages : false,
        hasPrevPage: page > 1,
      },
    };
  }

  async listPatientConsultations(
    actor: Actor,
    query: ConsultationHistoryQueryDto,
  ) {
    if (actor.role !== UserRole.patient) {
      throw new ForbiddenException('Forbidden');
    }

    return this.listHistory(query, {
      where: { patientUserId: actor.id },
      includePatient: false,
    });
  }

  async listDoctorPatientConsultations(
    actor: Actor,
    patientUserId: string,
    query: ConsultationHistoryQueryDto,
  ) {
    if (actor.role !== UserRole.doctor) {
      throw new ForbiddenException('Forbidden');
    }

    return this.listHistory(query, {
      where: { doctorUserId: actor.id, patientUserId },
      includePatient: true,
    });
  }

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

    return consultation;
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

  async upsertClinicalEpisodeDraft(
    actor: Actor,
    consultationId: string,
    dto: UpsertClinicalEpisodeDraftDto,
  ) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
    });

    if (!consultation) {
      throw new NotFoundException('Consultation not found');
    }

    if (consultation.doctorUserId !== actor.id) {
      throw new ForbiddenException('Forbidden');
    }

    if (consultation.status === ConsultationStatus.closed) {
      throw new ConflictException('Consultation already closed');
    }

    const episode =
      (await this.prisma.clinicalEpisode.findUnique({
        where: { consultationId },
      })) ??
      (await this.prisma.clinicalEpisode.create({
        data: {
          consultationId,
          patientUserId: consultation.patientUserId,
          doctorUserId: consultation.doctorUserId,
        },
      }));

    const draft =
      (await this.prisma.clinicalEpisodeNote.findFirst({
        where: {
          episodeId: episode.id,
          kind: ClinicalEpisodeNoteKind.draft,
          deletedAt: null,
        },
      })) ??
      (await this.prisma.clinicalEpisodeNote.create({
        data: {
          episodeId: episode.id,
          kind: ClinicalEpisodeNoteKind.draft,
          title: dto.title,
          body: dto.body,
          createdByUserId: actor.id,
          createdByRole: actor.role,
        },
      }));

    const updatedDraft =
      draft.title === dto.title && draft.body === dto.body
        ? draft
        : await this.prisma.clinicalEpisodeNote.update({
            where: { id: draft.id },
            data: {
              title: dto.title,
              body: dto.body,
            },
          });

    return {
      episodeId: episode.id,
      consultationId,
      draft: {
        id: updatedDraft.id,
        title: updatedDraft.title,
        body: updatedDraft.body,
        updatedAt: updatedDraft.updatedAt,
      },
    };
  }

  async finalizeClinicalEpisode(actor: Actor, consultationId: string) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
    });

    if (!consultation) {
      throw new NotFoundException('Consultation not found');
    }

    if (consultation.doctorUserId !== actor.id) {
      throw new ForbiddenException('Forbidden');
    }

    const episode =
      (await this.prisma.clinicalEpisode.findUnique({
        where: { consultationId },
      })) ??
      (await this.prisma.clinicalEpisode.create({
        data: {
          consultationId,
          patientUserId: consultation.patientUserId,
          doctorUserId: consultation.doctorUserId,
        },
      }));

    const draft = await this.prisma.clinicalEpisodeNote.findFirst({
      where: {
        episodeId: episode.id,
        kind: ClinicalEpisodeNoteKind.draft,
        deletedAt: null,
      },
    });

    if (!draft) {
      throw new UnprocessableEntityException('Draft not found');
    }

    const existingFinal = await this.prisma.clinicalEpisodeNote.findFirst({
      where: {
        episodeId: episode.id,
        kind: ClinicalEpisodeNoteKind.final,
        deletedAt: null,
      },
    });

    if (existingFinal) {
      throw new ConflictException('Final note already exists');
    }

    const finalNote = await this.prisma.clinicalEpisodeNote.create({
      data: {
        episodeId: episode.id,
        kind: ClinicalEpisodeNoteKind.final,
        title: draft.title,
        body: draft.body,
        createdByUserId: actor.id,
        createdByRole: actor.role,
      },
    });

    return {
      episodeId: episode.id,
      consultationId,
      final: {
        id: finalNote.id,
        title: finalNote.title,
        body: finalNote.body,
        formattedBody: finalNote.formattedBody,
        formattedAt: finalNote.formattedAt,
        displayBody: finalNote.formattedBody ?? finalNote.body,
        createdAt: finalNote.createdAt,
      },
    };
  }

  async getClinicalEpisodeForDoctor(actor: Actor, consultationId: string) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
    });

    if (!consultation) {
      throw new NotFoundException('Consultation not found');
    }

    if (consultation.doctorUserId !== actor.id) {
      throw new ForbiddenException('Forbidden');
    }

    const episode = await this.prisma.clinicalEpisode.findUnique({
      where: { consultationId },
    });

    if (!episode || episode.deletedAt) {
      throw new NotFoundException('Clinical episode not found');
    }

    const [draft, finalNote, addendums] = await this.prisma.$transaction([
      this.prisma.clinicalEpisodeNote.findFirst({
        where: {
          episodeId: episode.id,
          kind: ClinicalEpisodeNoteKind.draft,
          deletedAt: null,
        },
      }),
      this.prisma.clinicalEpisodeNote.findFirst({
        where: {
          episodeId: episode.id,
          kind: ClinicalEpisodeNoteKind.final,
          deletedAt: null,
        },
      }),
      this.prisma.clinicalEpisodeNote.findMany({
        where: {
          episodeId: episode.id,
          kind: ClinicalEpisodeNoteKind.addendum,
          deletedAt: null,
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    if (!draft && !finalNote && addendums.length === 0) {
      throw new NotFoundException('Clinical episode not found');
    }

    return {
      episodeId: episode.id,
      consultationId,
      ...(draft
        ? {
            draft: {
              id: draft.id,
              title: draft.title,
              body: draft.body,
              updatedAt: draft.updatedAt,
            },
          }
        : {}),
      ...(finalNote
        ? {
            final: {
              id: finalNote.id,
              title: finalNote.title,
              body: finalNote.body,
              formattedBody: finalNote.formattedBody,
              formattedAt: finalNote.formattedAt,
              displayBody: finalNote.formattedBody ?? finalNote.body,
              createdAt: finalNote.createdAt,
            },
          }
        : {}),
      addendums: addendums.map((note) => ({
        id: note.id,
        title: note.title,
        body: note.body,
        createdAt: note.createdAt,
      })),
    };
  }

  async getClinicalEpisodeForPatient(actor: Actor, consultationId: string) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
    });

    if (!consultation) {
      throw new NotFoundException('Consultation not found');
    }

    if (consultation.patientUserId !== actor.id) {
      throw new ForbiddenException('Forbidden');
    }

    if (consultation.status !== ConsultationStatus.closed) {
      throw new NotFoundException('Clinical episode not found');
    }

    const episode = await this.prisma.clinicalEpisode.findUnique({
      where: { consultationId },
    });

    if (!episode || episode.deletedAt) {
      throw new NotFoundException('Clinical episode not found');
    }

    const finalNote = await this.prisma.clinicalEpisodeNote.findFirst({
      where: {
        episodeId: episode.id,
        kind: ClinicalEpisodeNoteKind.final,
        deletedAt: null,
      },
    });

    if (!finalNote) {
      throw new NotFoundException('Clinical episode not found');
    }

    const addendums = await this.prisma.clinicalEpisodeNote.findMany({
      where: {
        episodeId: episode.id,
        kind: ClinicalEpisodeNoteKind.addendum,
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      episodeId: episode.id,
      consultationId,
      final: {
        id: finalNote.id,
        title: finalNote.title,
        formattedBody: finalNote.formattedBody,
        formattedAt: finalNote.formattedAt,
        displayBody: finalNote.formattedBody ?? finalNote.body,
        createdAt: finalNote.createdAt,
      },
      addendums: addendums.map((note) => ({
        id: note.id,
        title: note.title,
        body: note.body,
        createdAt: note.createdAt,
      })),
    };
  }

  async setClinicalEpisodeFinalFormatted(
    actor: Actor,
    consultationId: string,
    dto: SetClinicalEpisodeFormattedDto,
  ) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
    });

    if (!consultation) {
      throw new NotFoundException('Consultation not found');
    }

    if (consultation.doctorUserId !== actor.id) {
      throw new ForbiddenException('Forbidden');
    }

    const episode = await this.prisma.clinicalEpisode.findUnique({
      where: { consultationId },
    });

    if (!episode || episode.deletedAt) {
      throw new NotFoundException('Clinical episode not found');
    }

    const finalNote = await this.prisma.clinicalEpisodeNote.findFirst({
      where: {
        episodeId: episode.id,
        kind: ClinicalEpisodeNoteKind.final,
        deletedAt: null,
      },
    });

    if (!finalNote) {
      throw new NotFoundException('Clinical episode not found');
    }

    const updated = await this.prisma.clinicalEpisodeNote.update({
      where: { id: finalNote.id },
      data: {
        formattedBody: dto.formattedBody,
        formattedAt: new Date(),
        formattedByUserId: actor.id,
        formatVersion: dto.formatVersion ?? null,
        aiMeta:
          dto.aiMeta === undefined
            ? undefined
            : (dto.aiMeta as Prisma.InputJsonValue),
      },
    });

    return {
      episodeId: episode.id,
      consultationId,
      final: {
        id: updated.id,
        title: updated.title,
        body: updated.body,
        formattedBody: updated.formattedBody,
        formattedAt: updated.formattedAt,
        displayBody: updated.formattedBody ?? updated.body,
        createdAt: updated.createdAt,
      },
    };
  }

  async createClinicalEpisodeAddendum(
    actor: Actor,
    consultationId: string,
    dto: CreateClinicalEpisodeAddendumDto,
  ) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
    });

    if (!consultation) {
      throw new NotFoundException('Consultation not found');
    }

    if (consultation.doctorUserId !== actor.id) {
      throw new ForbiddenException('Forbidden');
    }

    if (consultation.status !== ConsultationStatus.closed) {
      throw new ConflictException('Consultation is not closed');
    }

    const episode = await this.prisma.clinicalEpisode.findUnique({
      where: { consultationId },
    });

    if (!episode || episode.deletedAt) {
      throw new ConflictException('Clinical episode not finalized');
    }

    const finalNote = await this.prisma.clinicalEpisodeNote.findFirst({
      where: {
        episodeId: episode.id,
        kind: ClinicalEpisodeNoteKind.final,
        deletedAt: null,
      },
    });

    if (!finalNote) {
      throw new ConflictException('Clinical episode not finalized');
    }

    const addendum = await this.prisma.clinicalEpisodeNote.create({
      data: {
        episodeId: episode.id,
        kind: ClinicalEpisodeNoteKind.addendum,
        title: dto.title,
        body: dto.body,
        createdByUserId: actor.id,
        createdByRole: actor.role,
      },
    });

    return {
      episodeId: episode.id,
      consultationId,
      addendum: {
        id: addendum.id,
        title: addendum.title,
        body: addendum.body,
        createdAt: addendum.createdAt,
      },
    };
  }
}
