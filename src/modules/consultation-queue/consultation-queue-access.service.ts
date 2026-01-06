import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { Actor } from '../../common/types/actor.type';
import { PrismaService } from '../../infra/prisma/prisma.service';

/**
 * Service for checking consultation queue item access authorization.
 * Reusable for both HTTP endpoints and WebSocket handlers.
 */
@Injectable()
export class ConsultationQueueAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check if actor can access a queue item.
   * Throws ForbiddenException if access is denied.
   * @param actor - The actor requesting access
   * @param queueItemId - The queue item ID
   * @returns The queue item if access is granted
   * @throws NotFoundException if queue item doesn't exist
   * @throws ForbiddenException if actor doesn't have access
   */
  async canAccess(actor: Actor, queueItemId: string) {
    const queue = await this.prisma.consultationQueueItem.findUnique({
      where: { id: queueItemId },
    });

    if (!queue) {
      throw new NotFoundException('Queue item not found');
    }

    // Patient: can only access their own queue items
    if (actor.role === UserRole.patient) {
      if (queue.patientUserId !== actor.id) {
        throw new ForbiddenException('Forbidden');
      }
      return queue;
    }

    // Doctor: can access queue items where they are the assigned doctor
    if (actor.role === UserRole.doctor) {
      if (queue.doctorUserId !== actor.id) {
        throw new ForbiddenException('Forbidden');
      }
      return queue;
    }

    // Admin: no access to queue items (operational only)
    throw new ForbiddenException('Forbidden');
  }
}
