import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuditAction,
  PatientFileStatus,
  PatientFileCategory,
  UserRole,
  ConsultationStatus,
} from '@prisma/client';
import type { Actor } from '../../common/types/actor.type';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { StorageService } from '../../infra/storage/storage.service';
import { AuditService } from '../../infra/audit/audit.service';
import { PatientFilesAccessService } from './patient-files-access.service';
import { encodeCursor, decodeCursor } from '../../common/utils/cursor';
import { randomUUID } from 'crypto';

// Allowed MIME types for patient files
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

// SHA-256 regex (64 hex characters)
const SHA256_REGEX = /^[a-f0-9]{64}$/i;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

@Injectable()
export class PatientFilesService {
  private readonly maxFileBytesPatient: number;
  private readonly maxFileBytesDoctor: number;
  private readonly presignTtlSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly auditService: AuditService,
    private readonly accessService: PatientFilesAccessService,
    private readonly configService: ConfigService,
  ) {
    this.maxFileBytesPatient =
      configService.get<number>('PATIENT_FILE_MAX_BYTES_PATIENT') ?? 20971520; // 20MB
    this.maxFileBytesDoctor =
      configService.get<number>('PATIENT_FILE_MAX_BYTES_DOCTOR') ?? 104857600; // 100MB
    this.presignTtlSeconds =
      configService.get<number>('PRESIGN_TTL_SECONDS') ?? 300;
  }

  /**
   * Prepare file upload - creates FileObject and PatientFile in pending_upload status
   * Returns presigned upload URL
   */
  async prepareUpload(
    actor: Actor,
    patientUserId: string,
    input: {
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      category?: PatientFileCategory;
      notes?: string;
      relatedConsultationId?: string;
      sha256?: string;
    },
    traceId?: string | null,
  ) {
    // Verify access
    const { patientId } = await this.accessService.canAccessPatientFiles(
      actor,
      patientUserId,
    );

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
      throw new UnprocessableEntityException('Unsupported file type');
    }

    // Validate file size based on role
    const maxSize =
      actor.role === UserRole.doctor
        ? this.maxFileBytesDoctor
        : this.maxFileBytesPatient;
    if (input.sizeBytes <= 0 || input.sizeBytes > maxSize) {
      throw new UnprocessableEntityException('Invalid file size');
    }

    // Validate SHA-256 if provided
    if (input.sha256 && !SHA256_REGEX.test(input.sha256)) {
      throw new UnprocessableEntityException('Invalid SHA-256 format');
    }

    // Validate relatedConsultationId if provided
    if (input.relatedConsultationId) {
      const consultation = await this.prisma.consultation.findUnique({
        where: { id: input.relatedConsultationId },
        select: {
          id: true,
          doctorUserId: true,
          patientUserId: true,
          status: true,
        },
      });

      if (!consultation) {
        throw new NotFoundException('Consultation not found');
      }

      if (consultation.patientUserId !== patientUserId) {
        throw new UnprocessableEntityException(
          'Consultation does not belong to patient',
        );
      }

      if (
        actor.role === UserRole.doctor &&
        consultation.doctorUserId !== actor.id
      ) {
        throw new UnprocessableEntityException(
          'Consultation does not belong to doctor',
        );
      }

      // Optional: only allow if consultation is in_progress
      // For now, we allow any consultation (user requirement says "opcional")
    }

    // Check for duplicate SHA-256 (soft dedupe)
    if (input.sha256) {
      const existing = await this.prisma.patientFile.findFirst({
        where: {
          patientId,
          sha256: input.sha256,
          status: PatientFileStatus.ready,
        },
        select: { id: true },
      });

      if (existing) {
        throw new ConflictException('File with same SHA-256 already exists');
      }
    }

    // Sanitize filename
    const filename = this.sanitizeFilename(input.originalName);
    if (!filename) {
      throw new UnprocessableEntityException('Invalid filename');
    }

    const fileObjectId = randomUUID();
    const patientFileId = randomUUID();
    const objectKey = this.buildObjectKey(patientId, fileObjectId, filename);

    // Create FileObject and PatientFile in a transaction
    const [fileObject, patientFile] = await this.prisma.$transaction([
      this.prisma.fileObject.create({
        data: {
          id: fileObjectId,
          bucket: this.storage.getBucket(),
          objectKey,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          sha256: input.sha256 ?? null,
          uploadedByUserId: actor.id,
        },
      }),
      this.prisma.patientFile.create({
        data: {
          id: patientFileId,
          patientId,
          fileObjectId,
          status: PatientFileStatus.pending_upload,
          originalName: filename,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          sha256: input.sha256 ?? null,
          category: input.category ?? PatientFileCategory.other,
          notes: input.notes ?? null,
          uploadedByUserId: actor.id,
          uploadedByRole: actor.role,
          relatedConsultationId: input.relatedConsultationId ?? null,
        },
      }),
    ]);

    // Generate presigned upload URL
    const uploadUrl = await this.storage.createUploadUrl({
      key: fileObject.objectKey,
      contentType: fileObject.mimeType,
      contentLength: fileObject.sizeBytes,
    });

    const expiresAt = new Date(Date.now() + this.presignTtlSeconds * 1000);

    // Audit
    await this.auditService.log({
      action: AuditAction.WRITE,
      resourceType: 'PatientFile',
      resourceId: patientFile.id,
      actor,
      traceId: traceId ?? null,
      metadata: {
        event: 'upload_prepared',
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        sha256: input.sha256,
        category: input.category,
        relatedConsultationId: input.relatedConsultationId,
      },
    });

    return {
      patientFileId: patientFile.id,
      fileObjectId: fileObject.id,
      uploadUrl,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Confirm file upload - marks FileObject and PatientFile as ready
   */
  async confirmUpload(
    actor: Actor,
    patientUserId: string,
    patientFileId: string,
    input: {
      fileObjectId: string;
      sha256?: string;
    },
    traceId?: string | null,
  ) {
    // Verify access
    await this.accessService.canAccessPatientFile(
      actor,
      patientUserId,
      patientFileId,
    );

    const patientFile = await this.prisma.patientFile.findUnique({
      where: { id: patientFileId },
      include: { fileObject: true },
    });

    if (!patientFile) {
      throw new NotFoundException('Patient file not found');
    }

    if (patientFile.status !== PatientFileStatus.pending_upload) {
      throw new ConflictException('File is not in pending_upload status');
    }

    if (patientFile.fileObjectId !== input.fileObjectId) {
      throw new ConflictException('FileObject ID mismatch');
    }

    // Validate SHA-256 if provided
    if (input.sha256) {
      if (!SHA256_REGEX.test(input.sha256)) {
        throw new UnprocessableEntityException('Invalid SHA-256 format');
      }

      // If PatientFile already has sha256, it must match
      if (patientFile.sha256 && patientFile.sha256 !== input.sha256) {
        throw new ConflictException('SHA-256 mismatch');
      }
    }

    // Update PatientFile status to ready
    await this.prisma.patientFile.update({
      where: { id: patientFileId },
      data: {
        status: PatientFileStatus.ready,
        sha256: input.sha256 ?? patientFile.sha256,
      },
    });

    // Audit
    await this.auditService.log({
      action: AuditAction.WRITE,
      resourceType: 'PatientFile',
      resourceId: patientFile.id,
      actor,
      traceId: traceId ?? null,
      metadata: {
        event: 'upload_confirmed',
        sha256: input.sha256 ?? patientFile.sha256,
      },
    });

    return { patientFileId };
  }

  /**
   * Get download URL for a patient file
   */
  async getDownloadUrl(
    actor: Actor,
    patientUserId: string,
    patientFileId: string,
    traceId?: string | null,
    ip?: string | null,
    userAgent?: string | null,
  ) {
    // Verify access
    await this.accessService.canAccessPatientFile(
      actor,
      patientUserId,
      patientFileId,
    );

    const patientFile = await this.prisma.patientFile.findUnique({
      where: { id: patientFileId },
      include: { fileObject: true },
    });

    if (!patientFile) {
      throw new NotFoundException('Patient file not found');
    }

    if (patientFile.status !== PatientFileStatus.ready) {
      throw new NotFoundException('File is not available for download');
    }

    const downloadUrl = await this.storage.createDownloadUrl(
      patientFile.fileObject.objectKey,
    );
    const expiresAt = new Date(Date.now() + this.presignTtlSeconds * 1000);

    // Audit
    await this.auditService.log({
      action: AuditAction.READ,
      resourceType: 'PatientFile',
      resourceId: patientFile.id,
      actor,
      traceId: traceId ?? null,
      ip: ip ?? null,
      userAgent: userAgent ?? null,
      metadata: {
        event: 'download_requested',
      },
    });

    return {
      downloadUrl,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * List patient files with pagination and filters
   */
  async listFiles(
    actor: Actor,
    patientUserId: string,
    options: {
      cursor?: string;
      limit?: number;
      category?: PatientFileCategory;
      relatedConsultationId?: string;
      q?: string; // Search by originalName
      status?: PatientFileStatus;
    },
    traceId?: string | null,
  ) {
    // Verify access
    const { patientId } = await this.accessService.canAccessPatientFiles(
      actor,
      patientUserId,
    );

    const resolvedLimit = Math.min(
      Math.max(options.limit ?? DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );

    let cursorData: { createdAt: string; id: string } | null = null;
    if (options.cursor) {
      try {
        cursorData = decodeCursor<{ createdAt: string; id: string }>(
          options.cursor,
        );
      } catch {
        throw new UnprocessableEntityException('Invalid cursor');
      }
    }

    const where: any = {
      patientId,
      status: options.status ?? PatientFileStatus.ready,
      ...(options.category ? { category: options.category } : {}),
      ...(options.relatedConsultationId
        ? { relatedConsultationId: options.relatedConsultationId }
        : {}),
      ...(options.q
        ? { originalName: { contains: options.q, mode: 'insensitive' } }
        : {}),
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

    const files = await this.prisma.patientFile.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: resolvedLimit + 1,
      select: {
        id: true,
        status: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        category: true,
        notes: true,
        uploadedByUserId: true,
        uploadedByRole: true,
        relatedConsultationId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const hasNext = files.length > resolvedLimit;
    const items = hasNext ? files.slice(0, resolvedLimit) : files;
    const endCursor =
      hasNext && items.length > 0
        ? encodeCursor({
            createdAt: items[items.length - 1].createdAt.toISOString(),
            id: items[items.length - 1].id,
          })
        : null;

    // Audit
    await this.auditService.log({
      action: AuditAction.READ,
      resourceType: 'PatientFile',
      resourceId: 'list',
      actor,
      traceId: traceId ?? null,
      metadata: {
        event: 'list_files',
        patientId,
        filters: {
          category: options.category,
          relatedConsultationId: options.relatedConsultationId,
          q: options.q,
          status: options.status,
        },
      },
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
   * Get a single patient file metadata
   */
  async getFile(
    actor: Actor,
    patientUserId: string,
    patientFileId: string,
    traceId?: string | null,
  ) {
    // Verify access
    await this.accessService.canAccessPatientFile(
      actor,
      patientUserId,
      patientFileId,
    );

    const patientFile = await this.prisma.patientFile.findUnique({
      where: { id: patientFileId },
      select: {
        id: true,
        status: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        category: true,
        notes: true,
        uploadedByUserId: true,
        uploadedByRole: true,
        relatedConsultationId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!patientFile) {
      throw new NotFoundException('Patient file not found');
    }

    // Audit
    await this.auditService.log({
      action: AuditAction.READ,
      resourceType: 'PatientFile',
      resourceId: patientFile.id,
      actor,
      traceId: traceId ?? null,
      metadata: {
        event: 'get_file',
      },
    });

    return patientFile;
  }

  /**
   * Delete (soft delete) a patient file
   */
  async deleteFile(
    actor: Actor,
    patientUserId: string,
    patientFileId: string,
    traceId?: string | null,
  ) {
    // Verify access
    await this.accessService.canAccessPatientFile(
      actor,
      patientUserId,
      patientFileId,
    );

    const patientFile = await this.prisma.patientFile.findUnique({
      where: { id: patientFileId },
    });

    if (!patientFile) {
      throw new NotFoundException('Patient file not found');
    }

    // Soft delete: mark as deleted
    await this.prisma.patientFile.update({
      where: { id: patientFileId },
      data: {
        status: PatientFileStatus.deleted,
      },
    });

    // Audit
    await this.auditService.log({
      action: AuditAction.WRITE,
      resourceType: 'PatientFile',
      resourceId: patientFile.id,
      actor,
      traceId: traceId ?? null,
      metadata: {
        event: 'deleted',
      },
    });

    return { patientFileId };
  }

  /**
   * Sanitize filename
   */
  private sanitizeFilename(filename: string): string {
    return filename
      .trim()
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 255);
  }

  /**
   * Build object key for patient files
   */
  private buildObjectKey(
    patientId: string,
    fileObjectId: string,
    filename: string,
  ): string {
    return `patient-files/${patientId}/${fileObjectId}/${filename}`;
  }
}
