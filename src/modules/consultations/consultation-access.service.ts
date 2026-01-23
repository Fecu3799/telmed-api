import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { Actor } from '../../common/types/actor.type';
import { PrismaService } from '../../infra/prisma/prisma.service';

/**
 * Gate de acceso a consultas
 * - Centraliza autorización de acceso a una consulta para usos realtime.
 *
 * How it works:
 * - Admin siempre Forbidden.
 * Solo doctor/patient; valida existencia y que el actor sea participante.
 */
@Injectable()
export class ConsultationAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check if actor can access a consultation.
   * Throws ForbiddenException if access is denied.
   * @param actor - The actor requesting access
   * @param consultationId - The consultation ID
   * @returns The consultation if access is granted
   * @throws NotFoundException if consultation doesn't exist
   * @throws ForbiddenException if actor doesn't have access
   */
  async canAccess(actor: Actor, consultationId: string) {
    // Admin cannot access consultation content (only operational status)
    if (actor.role === UserRole.admin) {
      throw new ForbiddenException('Forbidden');
    }

    // Only doctor and patient can access consultations
    if (actor.role !== UserRole.doctor && actor.role !== UserRole.patient) {
      throw new ForbiddenException('Forbidden');
    }

    const consultation = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
    });

    if (!consultation) {
      throw new NotFoundException('Consultation not found');
    }

    // Verify actor is a participant (doctor or patient)
    if (
      (actor.role === UserRole.doctor &&
        consultation.doctorUserId !== actor.id) ||
      (actor.role === UserRole.patient &&
        consultation.patientUserId !== actor.id)
    ) {
      throw new ForbiddenException('Forbidden');
    }

    return consultation;
  }
}
