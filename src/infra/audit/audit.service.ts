import { Injectable, Logger } from '@nestjs/common';
import type { Actor } from '../../common/types/actor.type';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction, Prisma, UserRole } from '@prisma/client';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(input: {
    action: AuditAction;
    resourceType: string;
    resourceId: string;
    actor?: Actor | null;
    traceId?: string | null;
    ip?: string | null;
    userAgent?: string | null;
    metadata?: Record<string, unknown> | null;
  }) {
    try {
      const metadata = input.metadata
        ? (input.metadata as Prisma.InputJsonValue)
        : undefined;
      await this.prisma.auditLog.create({
        data: {
          action: input.action,
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          actorId: input.actor?.id ?? null,
          actorRole: input.actor?.role ?? null,
          traceId: input.traceId ?? null,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
          metadata,
        },
      });
    } catch (error) {
      // Audit failures should not impact the main flow.
      this.logger.warn(
        JSON.stringify({ event: 'audit_log_failed', error: String(error) }),
      );
    }
  }
}
