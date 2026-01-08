import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { Actor } from '../../common/types/actor.type';
import { PrismaService } from '../../infra/prisma/prisma.service';

/**
 * Service for checking patient files access authorization.
 * Reusable for both HTTP endpoints and future WebSocket handlers.
 *
 * Rules:
 * - Patient: can access only their own files
 * - Doctor: can access files of patients they have consulted with (any Consultation exists)
 * - Admin: always FORBIDDEN (no access to patient file content)
 */
@Injectable()
export class PatientFilesAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve patientId from actor or path parameter.
   * For patients, always use actor.id (ignore path param).
   * For doctors, use the provided patientId (must be validated).
   */
  resolvePatientId(actor: Actor, pathPatientId?: string): string {
    if (actor.role === UserRole.patient) {
      return actor.id;
    }
    if (actor.role === UserRole.doctor && pathPatientId) {
      return pathPatientId;
    }
    throw new ForbiddenException('Forbidden');
  }

  /**
   * Check if actor can access files for a patient.
   * Throws ForbiddenException if access is denied.
   * @param actor - The actor requesting access
   * @param patientUserId - The patient user ID (not Patient.id, but User.id)
   * @returns The patient record if access is granted
   * @throws NotFoundException if patient doesn't exist
   * @throws ForbiddenException if actor doesn't have access
   */
  async canAccessPatientFiles(
    actor: Actor,
    patientUserId: string,
  ): Promise<{ patientId: string }> {
    // Admin cannot access patient file content
    if (actor.role === UserRole.admin) {
      throw new ForbiddenException('Forbidden');
    }

    // Only doctor and patient can access files
    if (actor.role !== UserRole.doctor && actor.role !== UserRole.patient) {
      throw new ForbiddenException('Forbidden');
    }

    // Patient can only access their own files
    if (actor.role === UserRole.patient) {
      if (actor.id !== patientUserId) {
        throw new ForbiddenException('Forbidden');
      }
    }

    // Find patient by userId
    const patient = await this.prisma.patient.findUnique({
      where: { userId: patientUserId },
      select: { id: true },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    // Doctor must have at least one Consultation with this patient
    if (actor.role === UserRole.doctor) {
      const hasConsultation = await this.prisma.consultation.findFirst({
        where: {
          doctorUserId: actor.id,
          patientUserId: patientUserId,
        },
        select: { id: true },
      });

      if (!hasConsultation) {
        throw new ForbiddenException('Forbidden');
      }
    }

    return { patientId: patient.id };
  }

  /**
   * Check if actor can access a specific patient file.
   * This includes checking patient file access AND that the file belongs to that patient.
   */
  async canAccessPatientFile(
    actor: Actor,
    patientUserId: string,
    patientFileId: string,
  ): Promise<{ patientFileId: string; patientId: string }> {
    const { patientId } = await this.canAccessPatientFiles(
      actor,
      patientUserId,
    );

    const patientFile = await this.prisma.patientFile.findUnique({
      where: { id: patientFileId },
      select: { patientId: true },
    });

    if (!patientFile) {
      throw new NotFoundException('Patient file not found');
    }

    if (patientFile.patientId !== patientId) {
      throw new ForbiddenException('Forbidden');
    }

    return { patientFileId, patientId };
  }
}
