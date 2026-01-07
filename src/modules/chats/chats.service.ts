import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../../infra/audit/audit.service';
import { AuditAction } from '@prisma/client';
import type { Actor } from '../../common/types/actor.type';
import { ChatRateLimitService } from './chat-rate-limit.service';
import { encodeCursor, decodeCursor } from '../../common/utils/cursor';
import { UserRole, ChatMessageKind, ChatParticipantRole } from '@prisma/client';

@Injectable()
export class ChatsService {
  private readonly logger = new Logger(ChatsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly rateLimitService: ChatRateLimitService,
  ) {}

  /**
   * Get or create thread with another user
   * Determines doctorUserId/patientUserId based on actor.role
   */
  async getOrCreateThread(
    actor: Actor,
    otherUserId: string,
    traceId?: string | null,
  ) {
    // Admin cannot access chat threads
    if (actor.role === UserRole.admin) {
      throw new ForbiddenException('Forbidden');
    }

    // Determine doctor/patient roles
    let doctorUserId: string;
    let patientUserId: string;

    if (actor.role === UserRole.doctor) {
      doctorUserId = actor.id;
      patientUserId = otherUserId;
      // Verify otherUserId is a patient
      const otherUser = await this.prisma.user.findUnique({
        where: { id: otherUserId },
        include: { patient: true },
      });
      if (
        !otherUser ||
        otherUser.role !== UserRole.patient ||
        !otherUser.patient
      ) {
        throw new NotFoundException('Patient not found');
      }
    } else if (actor.role === UserRole.patient) {
      patientUserId = actor.id;
      doctorUserId = otherUserId;
      // Verify otherUserId is a doctor
      const otherUser = await this.prisma.user.findUnique({
        where: { id: otherUserId },
        include: { doctorProfile: true },
      });
      if (
        !otherUser ||
        otherUser.role !== UserRole.doctor ||
        !otherUser.doctorProfile
      ) {
        throw new NotFoundException('Doctor not found');
      }
    } else {
      throw new ForbiddenException('Forbidden');
    }

    // Find or create thread
    let thread = await this.prisma.chatThread.findUnique({
      where: {
        doctorUserId_patientUserId: {
          doctorUserId,
          patientUserId,
        },
      },
      include: {
        policy: true,
        doctor: {
          select: { id: true, email: true, displayName: true },
        },
        patient: {
          select: { id: true, email: true, displayName: true },
        },
      },
    });

    if (!thread) {
      // Create thread with default policy
      thread = await this.prisma.chatThread.create({
        data: {
          doctorUserId,
          patientUserId,
          policy: {
            create: {
              patientCanMessage: true,
              dailyLimit: 10,
              burstLimit: 3,
              burstWindowSeconds: 30,
              requireRecentConsultation: true,
              recentConsultationWindowHours: 72,
              closedByDoctor: false,
            },
          },
        },
        include: {
          policy: true,
          doctor: {
            select: { id: true, email: true, displayName: true },
          },
          patient: {
            select: { id: true, email: true, displayName: true },
          },
        },
      });

      await this.auditService.log({
        action: AuditAction.WRITE,
        resourceType: 'ChatThread',
        resourceId: thread.id,
        actor,
        traceId: traceId ?? null,
        metadata: { event: 'thread_created' },
      });
    }

    return thread;
  }

  /**
   * List threads for actor (doctor or patient)
   * Ordered by lastMessageAt desc (nulls last), then updatedAt desc
   */
  async listThreads(actor: Actor, traceId?: string | null) {
    if (actor.role === UserRole.admin) {
      throw new ForbiddenException('Forbidden');
    }

    const where =
      actor.role === UserRole.doctor
        ? { doctorUserId: actor.id }
        : { patientUserId: actor.id };

    const threads = await this.prisma.chatThread.findMany({
      where,
      orderBy: [
        { lastMessageAt: { sort: 'desc', nulls: 'last' } },
        { updatedAt: 'desc' },
      ],
      include: {
        policy: true,
        doctor: {
          select: { id: true, email: true, displayName: true },
        },
        patient: {
          select: { id: true, email: true, displayName: true },
        },
      },
    });

    await this.auditService.log({
      action: AuditAction.READ,
      resourceType: 'ChatThread',
      resourceId: 'list',
      actor,
      traceId: traceId ?? null,
      metadata: { event: 'list_threads' },
    });

    return threads;
  }

  /**
   * Get messages for a thread with cursor pagination
   */
  async getMessages(
    actor: Actor,
    threadId: string,
    cursor?: string,
    limit: number = 50,
    traceId?: string | null,
  ) {
    // Verify access
    const thread = await this.prisma.chatThread.findUnique({
      where: { id: threadId },
    });

    if (!thread) {
      throw new NotFoundException('Thread not found');
    }

    // Admin cannot access chat content
    if (actor.role === UserRole.admin) {
      throw new ForbiddenException('Forbidden');
    }

    // Verify actor is part of thread
    if (
      (actor.role === UserRole.doctor && thread.doctorUserId !== actor.id) ||
      (actor.role === UserRole.patient && thread.patientUserId !== actor.id)
    ) {
      throw new ForbiddenException('Forbidden');
    }

    const resolvedLimit = Math.min(Math.max(limit, 1), 100);

    let cursorData: { createdAt: string; id: string } | null = null;
    if (cursor) {
      try {
        cursorData = decodeCursor<{ createdAt: string; id: string }>(cursor);
      } catch {
        throw new UnprocessableEntityException('Invalid cursor');
      }
    }

    const where: any = {
      threadId,
      ...(cursorData
        ? {
            OR: [
              { createdAt: { lt: new Date(cursorData.createdAt) } },
              {
                createdAt: new Date(cursorData.createdAt),
                id: { lt: cursorData.id },
              },
            ],
          }
        : {}),
    };

    const messages = await this.prisma.chatMessage.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: resolvedLimit + 1,
      include: {
        sender: {
          select: { id: true, email: true, displayName: true },
        },
      },
    });

    const hasNext = messages.length > resolvedLimit;
    const items = hasNext ? messages.slice(0, resolvedLimit) : messages;
    const endCursor =
      hasNext && items.length > 0
        ? encodeCursor({
            createdAt: items[items.length - 1].createdAt.toISOString(),
            id: items[items.length - 1].id,
          })
        : null;

    await this.auditService.log({
      action: AuditAction.READ,
      resourceType: 'ChatMessage',
      resourceId: threadId,
      actor,
      traceId: traceId ?? null,
      metadata: { event: 'list_messages' },
    });

    return {
      items,
      pageInfo: {
        hasNextPage: hasNext,
        endCursor,
      },
    };
  }

  /**
   * Update thread policy (only doctor can update)
   */
  async updatePolicy(
    actor: Actor,
    threadId: string,
    updates: {
      patientCanMessage?: boolean;
      dailyLimit?: number;
      burstLimit?: number;
      burstWindowSeconds?: number;
      requireRecentConsultation?: boolean;
      recentConsultationWindowHours?: number;
      closedByDoctor?: boolean;
      allowedSchedule?: any;
    },
    traceId?: string | null,
  ) {
    const thread = await this.prisma.chatThread.findUnique({
      where: { id: threadId },
      include: { policy: true },
    });

    if (!thread) {
      throw new NotFoundException('Thread not found');
    }

    // Only doctor can update policy
    if (actor.role !== UserRole.doctor || thread.doctorUserId !== actor.id) {
      throw new ForbiddenException('Forbidden');
    }

    // Validations
    if (updates.dailyLimit !== undefined && updates.dailyLimit <= 0) {
      throw new UnprocessableEntityException('dailyLimit must be > 0');
    }
    if (updates.burstLimit !== undefined && updates.burstLimit <= 0) {
      throw new UnprocessableEntityException('burstLimit must be > 0');
    }
    if (
      updates.burstWindowSeconds !== undefined &&
      updates.burstWindowSeconds <= 0
    ) {
      throw new UnprocessableEntityException('burstWindowSeconds must be > 0');
    }
    if (
      updates.recentConsultationWindowHours !== undefined &&
      updates.recentConsultationWindowHours <= 0
    ) {
      throw new UnprocessableEntityException(
        'recentConsultationWindowHours must be > 0',
      );
    }

    const policy = await this.prisma.chatPolicy.update({
      where: { threadId },
      data: updates,
    });

    await this.auditService.log({
      action: AuditAction.WRITE,
      resourceType: 'ChatPolicy',
      resourceId: threadId,
      actor,
      traceId: traceId ?? null,
      metadata: { event: 'policy_updated', updates },
    });

    return policy;
  }

  /**
   * Check if patient can send message based on policy
   * Returns error code if not allowed, null if allowed
   */
  async checkPatientCanMessage(
    threadId: string,
    patientUserId: string,
  ): Promise<{ allowed: boolean; errorCode?: string }> {
    const thread = await this.prisma.chatThread.findUnique({
      where: { id: threadId },
      include: { policy: true },
    });

    if (!thread || !thread.policy) {
      return { allowed: false, errorCode: 'NOT_FOUND' };
    }

    const policy = thread.policy;

    // Check if closed by doctor
    if (policy.closedByDoctor) {
      return { allowed: false, errorCode: 'THREAD_CLOSED_BY_DOCTOR' };
    }

    // Check if patient messaging is disabled
    if (!policy.patientCanMessage) {
      return { allowed: false, errorCode: 'PATIENT_MESSAGING_DISABLED' };
    }

    // Check for active consultation (context)
    const activeConsultation = await this.prisma.consultation.findFirst({
      where: {
        doctorUserId: thread.doctorUserId,
        patientUserId: thread.patientUserId,
        status: 'in_progress',
      },
      orderBy: { startedAt: 'desc' },
    });

    // If there's an active consultation, patient can always message
    if (activeConsultation) {
      return { allowed: true };
    }

    // No active consultation - check policy requirements

    // Check recent consultation requirement
    if (policy.requireRecentConsultation) {
      const now = new Date();
      const windowStart = new Date(
        now.getTime() - policy.recentConsultationWindowHours * 60 * 60 * 1000,
      );
      const recentConsultation = await this.prisma.consultation.findFirst({
        where: {
          doctorUserId: thread.doctorUserId,
          patientUserId: thread.patientUserId,
          status: 'closed',
          closedAt: {
            gte: windowStart,
          },
        },
        orderBy: { closedAt: 'desc' },
      });

      if (!recentConsultation) {
        return { allowed: false, errorCode: 'RECENT_CONSULTATION_REQUIRED' };
      }
    }

    // Check daily limit
    const dailyCheck = await this.rateLimitService.checkDailyLimit(
      threadId,
      patientUserId,
      policy.dailyLimit,
    );
    if (!dailyCheck.allowed) {
      return { allowed: false, errorCode: dailyCheck.error };
    }

    // Check burst limit
    const burstCheck = await this.rateLimitService.checkBurstLimit(
      threadId,
      patientUserId,
      policy.burstLimit,
      policy.burstWindowSeconds,
    );
    if (!burstCheck.allowed) {
      return { allowed: false, errorCode: burstCheck.error };
    }

    return { allowed: true };
  }

  /**
   * Create a chat message with deduplication
   * Returns existing message if clientMessageId already exists
   */
  async createMessage(
    actor: Actor,
    threadId: string,
    kind: ChatMessageKind,
    text: string | null,
    clientMessageId: string | null,
    traceId?: string | null,
  ) {
    const thread = await this.prisma.chatThread.findUnique({
      where: { id: threadId },
      include: { policy: true },
    });

    if (!thread) {
      throw new NotFoundException('Thread not found');
    }

    // Verify actor is part of thread
    const isDoctor =
      actor.role === UserRole.doctor && thread.doctorUserId === actor.id;
    const isPatient =
      actor.role === UserRole.patient && thread.patientUserId === actor.id;

    if (!isDoctor && !isPatient) {
      throw new ForbiddenException('Forbidden');
    }

    const senderRole: ChatParticipantRole = isDoctor ? 'doctor' : 'patient';

    // Check deduplication
    if (clientMessageId) {
      const existing = await this.prisma.chatMessage.findUnique({
        where: {
          threadId_senderUserId_clientMessageId: {
            threadId,
            senderUserId: actor.id,
            clientMessageId,
          },
        },
      });

      if (existing) {
        // Return existing message (idempotency)
        return existing;
      }
    }

    // Validate text for text messages
    if (kind === ChatMessageKind.text && !text) {
      throw new UnprocessableEntityException(
        'text is required for text messages',
      );
    }

    // Check policy for patient messages (doctor can always send)
    if (senderRole === 'patient') {
      const canMessage = await this.checkPatientCanMessage(threadId, actor.id);
      if (!canMessage.allowed) {
        throw new ConflictException({
          message: 'Cannot send message',
          extensions: { code: canMessage.errorCode },
        });
      }
    }

    // Find active consultation for context
    const activeConsultation = await this.prisma.consultation.findFirst({
      where: {
        doctorUserId: thread.doctorUserId,
        patientUserId: thread.patientUserId,
        status: 'in_progress',
      },
      orderBy: { startedAt: 'desc' },
    });

    // Create message
    const message = await this.prisma.chatMessage.create({
      data: {
        threadId,
        senderUserId: actor.id,
        senderRole,
        kind,
        text,
        clientMessageId,
        contextConsultationId: activeConsultation?.id ?? null,
      },
      include: {
        sender: {
          select: { id: true, email: true, displayName: true },
        },
      },
    });

    // Update thread lastMessageAt
    await this.prisma.chatThread.update({
      where: { id: threadId },
      data: { lastMessageAt: new Date() },
    });

    await this.auditService.log({
      action: AuditAction.WRITE,
      resourceType: 'ChatMessage',
      resourceId: message.id,
      actor,
      traceId: traceId ?? null,
      metadata: { event: 'message_created', threadId, kind },
    });

    return message;
  }
}
