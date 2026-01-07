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
  ConsultationStatus,
  UserRole,
} from '@prisma/client';
// Removed unused imports: decodeCursor, encodeCursor (were used for ConsultationMessage pagination)
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

  // Removed: listMessages, createTextMessage, markMessageDelivered
  // Chat messages are now handled by the chats module (ChatThread/ChatMessage)

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

    // File upload confirmed - file is ready for use
    // Note: File sharing in consultations is now handled via chat messages (chats module)
    // This method now only confirms the file upload without creating a message
    
    await this.prisma.consultation.update({
      where: { id: consultation.id },
      data: { lastActivityAt: this.clock.now() },
    });

    await this.auditService.log({
      action: AuditAction.WRITE,
      resourceType: 'FileObject',
      resourceId: file.id,
      actor,
      metadata: { consultationId, event: 'file_upload_confirmed' },
    });

    return {
      id: file.id,
      consultationId: consultation.id,
      fileId: file.id,
      file: {
        id: file.id,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
      },
    };
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
