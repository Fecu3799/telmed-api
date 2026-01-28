import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ClinicalEpisodeNoteKind,
  ClinicalNoteFormatJobStatus,
  Prisma,
} from '@prisma/client';
import { createHash } from 'crypto';
import type { Actor } from '../../common/types/actor.type';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ConsultationAccessService } from '../consultations/consultation-access.service';
import { CreateFormatJobDto } from './dto/create-format-job.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { getTraceId } from '../../common/request-context';

/**
 * Clinical note format jobs service.
 * What it does:
 * - Creates and manages format jobs for clinical episode final notes.
 * - Handles deduplication by inputHash and job status.
 * How it works:
 * - Creates job in DB, enqueues in BullMQ, returns jobId.
 * - GET endpoint retrieves job with proposals if completed.
 * Gotchas:
 * - Only doctor owner can create jobs; requires final note to exist.
 * - Deduplication: same inputHash + status in (queued, processing, completed) returns existing job.
 */
@Injectable()
export class ClinicalNoteFormatService {
  private readonly logger = new Logger(ClinicalNoteFormatService.name);
  private readonly promptVersion = 1; // Hardcoded for now

  constructor(
    private readonly prisma: PrismaService,
    private readonly consultationAccessService: ConsultationAccessService,
    @InjectQueue('clinical-note-format')
    private readonly formatQueue: Queue,
  ) {}

  /**
   * Create or retrieve format job for a consultation's final note.
   */
  async createFormatJob(
    actor: Actor,
    consultationId: string,
    dto: CreateFormatJobDto,
  ) {
    // Only doctor can create format jobs
    if (actor.role !== 'doctor') {
      throw new ForbiddenException('Forbidden');
    }

    // Verify consultation access (also validates ownership)
    const consultation = await this.consultationAccessService.canAccess(
      actor,
      consultationId,
    );

    // Verify doctor is owner
    if (consultation.doctorUserId !== actor.id) {
      throw new ForbiddenException('Forbidden');
    }

    // Find clinical episode
    const episode = await this.prisma.clinicalEpisode.findUnique({
      where: { consultationId },
      include: {
        notes: {
          where: {
            kind: ClinicalEpisodeNoteKind.final,
            deletedAt: null,
          },
        },
      },
    });

    if (!episode) {
      throw new NotFoundException('Clinical episode not found');
    }

    const finalNote = episode.notes.find(
      (n) => n.kind === ClinicalEpisodeNoteKind.final,
    );

    if (!finalNote) {
      throw new ConflictException('Final note required');
    }

    // Resolve preset and options with defaults
    const preset = dto.preset ?? 'standard';
    const formatProfile = 'clinical_default';
    const options = (dto.options ?? {}) as Record<string, unknown>;

    // Calculate inputHash
    const inputHash = this.calculateInputHash(
      {
        title: finalNote.title,
        body: finalNote.body,
      },
      formatProfile,
      options,
      this.promptVersion,
    );

    // Check for existing job with same inputHash and status in (queued, processing, completed)
    const existingJob = await this.prisma.clinicalNoteFormatJob.findFirst({
      where: {
        finalNoteId: finalNote.id,
        inputHash,
        status: {
          in: [
            ClinicalNoteFormatJobStatus.queued,
            ClinicalNoteFormatJobStatus.processing,
            ClinicalNoteFormatJobStatus.completed,
          ],
        },
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existingJob) {
      this.logger.log(
        JSON.stringify({
          event: 'format_job_deduplicated',
          jobId: existingJob.id,
          consultationId,
          finalNoteId: finalNote.id,
          inputHash,
          status: existingJob.status,
          traceId: getTraceId() ?? null,
        }),
      );
      return {
        jobId: existingJob.id,
        status: existingJob.status,
      };
    }

    // Create new job
    const job = await this.prisma.clinicalNoteFormatJob.create({
      data: {
        finalNoteId: finalNote.id,
        consultationId,
        patientUserId: consultation.patientUserId,
        doctorUserId: consultation.doctorUserId,
        preset,
        options: options as Prisma.InputJsonValue,
        promptVersion: this.promptVersion,
        inputHash,
        status: ClinicalNoteFormatJobStatus.queued,
      },
    });

    // Enqueue in BullMQ
    try {
      await this.formatQueue.add(
        'format-clinical-note',
        {
          jobId: job.id,
          finalNoteId: finalNote.id,
          consultationId,
          preset,
          formatProfile,
          options,
          promptVersion: this.promptVersion,
        },
        {
          jobId: job.id, // Use DB job ID as BullMQ job ID for deduplication
          removeOnComplete: {
            age: 3600, // Keep completed jobs for 1 hour
            count: 100, // Keep last 100 completed jobs
          },
          removeOnFail: {
            age: 86400, // Keep failed jobs for 24 hours
          },
        },
      );

      this.logger.log(
        JSON.stringify({
          event: 'format_job_created',
          jobId: job.id,
          consultationId,
          finalNoteId: finalNote.id,
          preset,
          traceId: getTraceId() ?? null,
        }),
      );
    } catch (error) {
      // If enqueue fails, mark job as failed
      await this.prisma.clinicalNoteFormatJob.update({
        where: { id: job.id },
        data: {
          status: ClinicalNoteFormatJobStatus.failed,
          finishedAt: new Date(),
          errorCode: 'ENQUEUE_FAILED',
          errorMessage:
            error instanceof Error ? error.message : 'Failed to enqueue job',
        },
      });

      this.logger.error(
        JSON.stringify({
          event: 'format_job_enqueue_failed',
          jobId: job.id,
          consultationId,
          error: error instanceof Error ? error.message : String(error),
          traceId: getTraceId() ?? null,
        }),
      );

      throw new ConflictException('Failed to enqueue format job');
    }

    return {
      jobId: job.id,
      status: job.status,
    };
  }

  /**
   * Get format job by ID (doctor only, with ownership check).
   */
  async getFormatJob(actor: Actor, jobId: string) {
    // Only doctor can view format jobs
    if (actor.role !== 'doctor') {
      throw new ForbiddenException('Forbidden');
    }

    const job = await this.prisma.clinicalNoteFormatJob.findUnique({
      where: { id: jobId },
      include: {
        proposals: {
          where: { deletedAt: null },
        },
      },
    });

    if (!job) {
      throw new NotFoundException('Format job not found');
    }

    // Verify ownership
    if (job.doctorUserId !== actor.id) {
      throw new NotFoundException('Format job not found'); // 404 to avoid leaking existence
    }

    // Build proposals map
    const proposals: {
      A?: { title?: string | null; body: string };
      B?: { title?: string | null; body: string };
      C?: { title?: string | null; body: string };
    } = {};

    for (const proposal of job.proposals) {
      if (proposal.variant === 'A') {
        proposals.A = { title: proposal.title, body: proposal.body };
      } else if (proposal.variant === 'B') {
        proposals.B = { title: proposal.title, body: proposal.body };
      } else if (proposal.variant === 'C') {
        proposals.C = { title: proposal.title, body: proposal.body };
      }
    }

    const response: {
      id: string;
      status: ClinicalNoteFormatJobStatus;
      preset: string;
      options: Record<string, unknown> | null;
      promptVersion: number;
      provider?: string | null;
      model?: string | null;
      createdAt: string;
      startedAt: string | null;
      finishedAt: string | null;
      proposals?: typeof proposals;
      error?: { code: string | null; message: string | null };
    } = {
      id: job.id,
      status: job.status,
      preset: job.preset,
      options: (job.options as Record<string, unknown>) ?? null,
      promptVersion: job.promptVersion,
      provider: job.provider ?? null,
      model: job.model ?? null,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      finishedAt: job.finishedAt?.toISOString() ?? null,
    };

    if (job.status === ClinicalNoteFormatJobStatus.completed) {
      response.proposals =
        Object.keys(proposals).length > 0 ? proposals : undefined;
    }

    if (job.status === ClinicalNoteFormatJobStatus.failed) {
      response.error = {
        code: job.errorCode,
        message: job.errorMessage,
      };
    }

    return response;
  }

  /**
   * Calculate input hash for deduplication.
   */
  private calculateInputHash(
    note: { title?: string | null; body: string },
    formatProfile: string,
    options: Record<string, unknown>,
    promptVersion: number,
  ): string {
    const input = JSON.stringify({
      title: note.title ?? null,
      body: note.body,
      formatProfile,
      options,
      promptVersion,
    });
    return createHash('sha256').update(input).digest('hex');
  }
}
