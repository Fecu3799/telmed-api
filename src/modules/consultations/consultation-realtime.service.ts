import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuditAction,
  ConsultationMessageKind,
  ConsultationStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { decodeCursor, encodeCursor } from '../../common/utils/cursor';
import type { Actor } from '../../common/types/actor.type';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { StorageService } from '../../infra/storage/storage.service';
import { LiveKitService } from './livekit.service';
import { AuditService } from '../../infra/audit/audit.service';
import { Inject } from '@nestjs/common';
import { CLOCK } from '../../common/clock/clock';
import type { Clock } from '../../common/clock/clock';
import { randomUUID } from 'crypto';

const DEFAULT_MESSAGE_LIMIT = 50;
const MAX_MESSAGE_LIMIT = 100;
const MAX_MESSAGE_LENGTH = 2000;
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'application/pdf',
]);

@Injectable()
export class ConsultationRealtimeService {
  private readonly maxFileBytes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly livekitService: LiveKitService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.maxFileBytes =
      configService.get<number>('CONSULTATION_FILE_MAX_BYTES') ?? 10485760;
  }

  async issueLivekitToken(
    actor: Actor,
    consultationId: string,
    traceId?: string,
  ) {
    if (actor.role === UserRole.admin) {
      throw new ForbiddenException('Forbidden');
    }

    const consultation = await this.getConsultationForParticipant(
      actor,
      consultationId,
    );

    if (consultation.status !== ConsultationStatus.in_progress) {
      throw new ConflictException('Consultation is not in progress');
    }

    const roomName =
      consultation.videoRoomName ?? `consultation_${consultation.id}`;

    if (!consultation.videoProvider || !consultation.videoRoomName) {
      // Persist the room metadata once to keep token issuance deterministic.
      await this.prisma.consultation.update({
        where: { id: consultation.id },
        data: {
          videoProvider: 'livekit',
          videoRoomName: roomName,
          videoCreatedAt: consultation.videoCreatedAt ?? this.clock.now(),
        },
      });
    }

    const tokenResult = this.livekitService.issueToken({
      identity: actor.id,
      roomName,
      canPublish: true,
      canSubscribe: true,
    });

    // Token issuance is audited without persisting sensitive token data.
    await this.auditService.log({
      action: AuditAction.WRITE,
      resourceType: 'Consultation',
      resourceId: consultation.id,
      actor,
      traceId: traceId ?? null,
      metadata: { event: 'livekit_token_issued' },
    });

    return tokenResult;
  }

  async listMessages(
    actor: Actor,
    consultationId: string,
    query: { cursor?: string; limit?: number },
    traceId?: string | null,
  ) {
    await this.getConsultationForParticipant(actor, consultationId);

    const limit = Math.min(
      Math.max(query.limit ?? DEFAULT_MESSAGE_LIMIT, 1),
      MAX_MESSAGE_LIMIT,
    );

    let cursor: { createdAt: string; id: string } | null = null;
    if (query.cursor) {
      try {
        cursor = decodeCursor<{ createdAt: string; id: string }>(query.cursor);
      } catch {
        throw new UnprocessableEntityException('Invalid cursor');
      }
    }

    const where: Prisma.ConsultationMessageWhereInput = {
      consultationId,
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: new Date(cursor.createdAt) } },
              {
                createdAt: new Date(cursor.createdAt),
                id: { lt: cursor.id },
              },
            ],
          }
        : {}),
    };

    const messages = await this.prisma.consultationMessage.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        file: {
          select: { id: true, mimeType: true, sizeBytes: true },
        },
      },
    });

    const hasNext = messages.length > limit;
    const items = hasNext ? messages.slice(0, limit) : messages;
    const nextCursor = hasNext
      ? encodeCursor({
          createdAt: items[items.length - 1].createdAt.toISOString(),
          id: items[items.length - 1].id,
        })
      : null;

    await this.auditService.log({
      action: AuditAction.READ,
      resourceType: 'ConsultationMessage',
      resourceId: consultationId,
      actor,
      traceId: traceId ?? null,
      metadata: { event: 'list' },
    });

    return {
      items,
      pageInfo: { nextCursor },
    };
  }

  async createTextMessage(actor: Actor, consultationId: string, text: string) {
    const consultation = await this.getConsultationForParticipant(
      actor,
      consultationId,
    );

    if (consultation.status !== ConsultationStatus.in_progress) {
      throw new ConflictException('Consultation is not in progress');
    }

    const trimmed = text.trim();
    if (trimmed.length === 0) {
      throw new UnprocessableEntityException('Message text is required');
    }
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      throw new UnprocessableEntityException('Message text too long');
    }

    // Do not log message contents; only persist for participants.
    const message = await this.prisma.consultationMessage.create({
      data: {
        consultationId: consultation.id,
        senderUserId: actor.id,
        kind: ConsultationMessageKind.text,
        text: trimmed,
      },
    });

    await this.prisma.consultation.update({
      where: { id: consultation.id },
      data: { lastActivityAt: this.clock.now() },
    });

    await this.auditService.log({
      action: AuditAction.WRITE,
      resourceType: 'ConsultationMessage',
      resourceId: message.id,
      actor,
      metadata: { kind: 'text' },
    });

    return message;
  }

  async markMessageDelivered(
    actor: Actor,
    consultationId: string,
    messageId: string,
  ) {
    await this.getConsultationForParticipant(actor, consultationId);

    const message = await this.prisma.consultationMessage.findUnique({
      where: { id: messageId },
    });

    if (!message || message.consultationId !== consultationId) {
      throw new NotFoundException('Message not found');
    }

    if (message.senderUserId === actor.id) {
      throw new BadRequestException('Cannot deliver own message');
    }

    if (message.deliveredAt) {
      return message;
    }

    const delivered = await this.prisma.consultationMessage.update({
      where: { id: messageId },
      data: { deliveredAt: this.clock.now() },
    });

    await this.auditService.log({
      action: AuditAction.WRITE,
      resourceType: 'ConsultationMessage',
      resourceId: delivered.id,
      actor,
      metadata: { event: 'delivered' },
    });

    return delivered;
  }

  async prepareFileUpload(
    actor: Actor,
    consultationId: string,
    input: {
      filename: string;
      mimeType: string;
      sizeBytes: number;
      sha256?: string | null;
    },
    traceId?: string,
  ) {
    const consultation = await this.getConsultationForParticipant(
      actor,
      consultationId,
    );

    if (consultation.status !== ConsultationStatus.in_progress) {
      throw new ConflictException('Consultation is not in progress');
    }

    const filename = this.sanitizeFilename(input.filename);
    if (!filename) {
      throw new UnprocessableEntityException('Invalid filename');
    }

    if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
      throw new UnprocessableEntityException('Unsupported file type');
    }

    if (input.sizeBytes <= 0 || input.sizeBytes > this.maxFileBytes) {
      throw new UnprocessableEntityException('Invalid file size');
    }

    const fileId = randomUUID();
    const objectKey = this.buildObjectKey(consultationId, fileId, filename);

    const file = await this.prisma.fileObject.create({
      data: {
        id: fileId,
        bucket: this.storage.getBucket(),
        objectKey,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        sha256: input.sha256 ?? null,
        uploadedByUserId: actor.id,
      },
    });

    const uploadUrl = await this.storage.createUploadUrl({
      key: file.objectKey,
      contentType: file.mimeType,
      contentLength: file.sizeBytes,
    });

    await this.auditService.log({
      action: AuditAction.WRITE,
      resourceType: 'FileObject',
      resourceId: file.id,
      actor,
      traceId: traceId ?? null,
      metadata: {
        consultationId,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
      },
    });

    return {
      fileId: file.id,
      uploadUrl,
      bucket: file.bucket,
      objectKey: file.objectKey,
    };
  }

  async confirmFileUpload(
    actor: Actor,
    consultationId: string,
    fileId: string,
  ) {
    const consultation = await this.getConsultationForParticipant(
      actor,
      consultationId,
    );

    if (consultation.status !== ConsultationStatus.in_progress) {
      throw new ConflictException('Consultation is not in progress');
    }

    const file = await this.prisma.fileObject.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    if (file.uploadedByUserId !== actor.id) {
      throw new ForbiddenException('Forbidden');
    }

    if (!file.objectKey.startsWith(`consultations/${consultationId}/`)) {
      throw new ConflictException('File does not belong to consultation');
    }

    // TODO: verify sha256/size against the object metadata if needed.
    const message = await this.prisma.consultationMessage.create({
      data: {
        consultationId: consultation.id,
        senderUserId: actor.id,
        kind: ConsultationMessageKind.file,
        fileId: file.id,
      },
      include: {
        file: { select: { id: true, mimeType: true, sizeBytes: true } },
      },
    });

    await this.prisma.consultation.update({
      where: { id: consultation.id },
      data: { lastActivityAt: this.clock.now() },
    });

    await this.auditService.log({
      action: AuditAction.WRITE,
      resourceType: 'ConsultationMessage',
      resourceId: message.id,
      actor,
      metadata: { kind: 'file', fileId: file.id },
    });

    return message;
  }

  async getDownloadUrl(
    actor: Actor,
    consultationId: string,
    fileId: string,
    traceId?: string,
  ) {
    await this.getConsultationForParticipant(actor, consultationId);

    const file = await this.prisma.fileObject.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    if (!file.objectKey.startsWith(`consultations/${consultationId}/`)) {
      throw new ConflictException('File does not belong to consultation');
    }

    const downloadUrl = await this.storage.createDownloadUrl(file.objectKey);

    await this.auditService.log({
      action: AuditAction.READ,
      resourceType: 'FileObject',
      resourceId: file.id,
      actor,
      traceId: traceId ?? null,
      metadata: { consultationId },
    });

    return { downloadUrl };
  }

  private async getConsultationForParticipant(actor: Actor, id: string) {
    if (actor.role !== UserRole.doctor && actor.role !== UserRole.patient) {
      throw new ForbiddenException('Forbidden');
    }

    const consultation = await this.prisma.consultation.findUnique({
      where: { id },
    });

    if (!consultation) {
      throw new NotFoundException('Consultation not found');
    }

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

  private sanitizeFilename(filename: string): string {
    return filename
      .trim()
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 120);
  }

  private buildObjectKey(
    consultationId: string,
    fileId: string,
    filename: string,
  ): string {
    return `consultations/${consultationId}/${fileId}/${filename}`;
  }
}
