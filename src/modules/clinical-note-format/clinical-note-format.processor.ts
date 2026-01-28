import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Inject as NestInject, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import {
  ClinicalNoteFormatJobStatus,
  ClinicalNoteFormatProposalVariant,
} from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { FormatterProvider } from './formatter-provider.interface';
import { ConsultationRealtimeGateway } from '../consultations/consultation-realtime.gateway';
import { getTraceId } from '../../common/request-context';

type FormatJobData = {
  jobId: string;
  finalNoteId: string;
  consultationId: string;
  preset: string;
  options: Record<string, unknown>;
  promptVersion: number;
};

/**
 * BullMQ processor for clinical note format jobs.
 * What it does:
 * - Processes format jobs from the queue, generates proposals, and persists them.
 * How it works:
 * - Marks job as processing, calls formatter provider, saves proposals, marks completed.
 * - Emits Socket.IO event when done.
 * Gotchas:
 * - Retries up to 3 times with exponential backoff on failure.
 * - Concurrency is configured via processor options (default 2, overridden by env).
 */
@Processor('clinical-note-format', {
  concurrency: parseInt(
    process.env.CLINICAL_NOTE_FORMAT_CONCURRENCY || '2',
    10,
  ),
})
export class ClinicalNoteFormatProcessor
  extends WorkerHost
  implements OnModuleInit
{
  private readonly logger = new Logger(ClinicalNoteFormatProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @NestInject('FormatterProvider')
    private readonly formatterProvider: FormatterProvider,
    private readonly realtimeGateway: ConsultationRealtimeGateway,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  onModuleInit() {
    const provider = this.configService.get<string>(
      'CLINICAL_NOTE_FORMAT_PROVIDER',
    ) ?? 'dummy';
    const concurrency = this.configService.get<number>(
      'CLINICAL_NOTE_FORMAT_CONCURRENCY',
    ) ?? 2;

    this.logger.log(
      JSON.stringify({
        event: 'clinical_note_format_worker_started',
        provider,
        concurrency,
        queue: 'clinical-note-format',
      }),
    );
  }

  async process(job: Job<FormatJobData>) {
    const {
      jobId,
      finalNoteId,
      consultationId,
      preset,
      options,
      promptVersion,
    } = job.data;
    const traceId = getTraceId() ?? job.id ?? null;
    const startTime = Date.now();

    this.logger.log(
      JSON.stringify({
        event: 'format_job_processing_start',
        jobId,
        consultationId,
        finalNoteId,
        preset,
        provider: this.configService.get<string>(
          'CLINICAL_NOTE_FORMAT_PROVIDER',
        ) ?? 'dummy',
        traceId,
      }),
    );

    try {
      // Mark job as processing
      await this.prisma.clinicalNoteFormatJob.update({
        where: { id: jobId },
        data: {
          status: ClinicalNoteFormatJobStatus.processing,
          startedAt: new Date(),
        },
      });

      // Load final note
      const finalNote = await this.prisma.clinicalEpisodeNote.findUnique({
        where: { id: finalNoteId },
      });

      if (!finalNote) {
        throw new Error('Final note not found');
      }

      // Generate proposals using provider
      const proposals = await this.formatterProvider.formatClinicalNote({
        rawText: finalNote.body,
        preset,
        options,
        promptVersion,
      });

      // Persist proposals (upsert by jobId + variant)
      await Promise.all([
        this.upsertProposal(jobId, 'A', proposals.A),
        this.upsertProposal(jobId, 'B', proposals.B),
        this.upsertProposal(jobId, 'C', proposals.C),
      ]);

      // Mark job as completed
      await this.prisma.clinicalNoteFormatJob.update({
        where: { id: jobId },
        data: {
          status: ClinicalNoteFormatJobStatus.completed,
          finishedAt: new Date(),
        },
      });

      const durationMs = Date.now() - startTime;

      this.logger.log(
        JSON.stringify({
          event: 'format_job_processing_completed',
          jobId,
          consultationId,
          finalNoteId,
          durationMs,
          traceId,
        }),
      );

      // Emit Socket.IO event
      try {
        this.realtimeGateway.emitFormatJobReady(
          consultationId,
          jobId,
          finalNoteId,
          traceId,
        );
      } catch (socketError) {
        // Log but don't fail: Socket.IO is best-effort
        this.logger.warn(
          JSON.stringify({
            event: 'format_job_socket_emit_failed',
            jobId,
            consultationId,
            error:
              socketError instanceof Error
                ? socketError.message
                : String(socketError),
            traceId,
          }),
        );
      }
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorCode = error instanceof Error ? error.name : 'UNKNOWN_ERROR';

      // Mark job as failed
      await this.prisma.clinicalNoteFormatJob.update({
        where: { id: jobId },
        data: {
          status: ClinicalNoteFormatJobStatus.failed,
          finishedAt: new Date(),
          errorCode,
          errorMessage,
        },
      });

      this.logger.error(
        JSON.stringify({
          event: 'format_job_processing_failed',
          jobId,
          consultationId,
          finalNoteId,
          durationMs,
          error: errorMessage,
          errorCode,
          traceId,
        }),
      );

      // Emit failure event (optional)
      try {
        this.realtimeGateway.emitFormatJobFailed(
          consultationId,
          jobId,
          errorCode,
          traceId,
        );
      } catch (socketError) {
        // Log but don't fail
        this.logger.warn(
          JSON.stringify({
            event: 'format_job_socket_emit_failed',
            jobId,
            consultationId,
            error:
              socketError instanceof Error
                ? socketError.message
                : String(socketError),
            traceId,
          }),
        );
      }

      throw error; // Re-throw to trigger retry
    }
  }

  private async upsertProposal(
    jobId: string,
    variant: ClinicalNoteFormatProposalVariant,
    proposal: { title?: string; body: string },
  ) {
    await this.prisma.clinicalNoteFormatProposal.upsert({
      where: {
        jobId_variant: {
          jobId,
          variant,
        },
      },
      create: {
        jobId,
        variant,
        title: proposal.title ?? null,
        body: proposal.body,
      },
      update: {
        title: proposal.title ?? null,
        body: proposal.body,
        deletedAt: null, // Reactivate if was soft-deleted
      },
    });
  }
}
