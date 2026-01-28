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
import { DummyFormatterProvider } from './dummy-formatter.provider';
import { OpenAiFormatterProvider } from './openai-formatter.provider';
import {
  FORMAT_JOB_EVENTS_PUBLISHER,
  type FormatJobEventPayload,
  type FormatJobEventsPublisher,
} from './format-job-events.types';
import { getTraceId } from '../../common/request-context';

type FormatJobData = {
  jobId: string;
  finalNoteId: string;
  consultationId: string;
  preset: string;
  options: Record<string, unknown>;
  promptVersion: number;
  formatProfile?: string;
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
    private readonly dummyFormatterProvider: DummyFormatterProvider,
    @NestInject(FORMAT_JOB_EVENTS_PUBLISHER)
    private readonly eventsPublisher: FormatJobEventsPublisher,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  onModuleInit() {
    const providerConfigured = this.getConfiguredProvider();
    const providerEffective = this.getProviderName(this.formatterProvider);
    const concurrency =
      this.configService.get<number>('CLINICAL_NOTE_FORMAT_CONCURRENCY') ?? 2;

    this.logger.log(
      JSON.stringify({
        event: 'clinical_note_format_worker_started',
        providerConfigured,
        providerEffective,
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
      formatProfile,
    } = job.data;
    const traceId = getTraceId() ?? job.id ?? null;
    const startTime = Date.now();
    const providerConfigured = this.getConfiguredProvider();
    const providerEffective = this.getProviderName(this.formatterProvider);
    let episodeId: string | null = null;

    this.logger.log(
      JSON.stringify({
        event: 'format_job_processing_start',
        jobId,
        consultationId,
        finalNoteId,
        preset,
        providerConfigured,
        providerEffective,
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
      episodeId = finalNote.episodeId;

      const profile = formatProfile ?? preset ?? 'clinical_default';
      const formatInput = {
        rawTitle: finalNote.title,
        rawBody: finalNote.body,
        formatProfile: profile,
        options,
        promptVersion,
        traceId,
        consultationId,
        episodeId: finalNote.episodeId,
        finalNoteId,
      };

      let providerUsed = providerEffective;
      let modelUsed =
        providerEffective === 'openai'
          ? (this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini')
          : null;

      // Generate proposals using provider
      let proposals: {
        A: { title?: string; body: string };
        B: { title?: string; body: string };
        C: { title?: string; body: string };
      };

      try {
        proposals =
          await this.formatterProvider.formatClinicalNote(formatInput);
      } catch (error) {
        if (providerEffective !== 'openai') {
          throw error;
        }

        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const errorCode = this.classifyErrorCode(error);

        this.logger.warn(
          JSON.stringify({
            event: 'format_job_openai_fallback_dummy',
            jobId,
            consultationId,
            finalNoteId,
            error: errorMessage,
            errorCode,
            traceId,
          }),
        );

        proposals =
          await this.dummyFormatterProvider.formatClinicalNote(formatInput);
        providerUsed = 'dummy';
        modelUsed = null;
      }

      // Persist proposals (upsert by jobId + variant)
      await Promise.all([
        this.upsertProposal(jobId, 'A', proposals.A),
        this.upsertProposal(jobId, 'B', proposals.B),
        this.upsertProposal(jobId, 'C', proposals.C),
      ]);

      // Mark job as completed with provider/model metadata
      await this.prisma.clinicalNoteFormatJob.update({
        where: { id: jobId },
        data: {
          status: ClinicalNoteFormatJobStatus.completed,
          finishedAt: new Date(),
          provider: providerUsed,
          model: modelUsed,
        },
      });

      const durationMs = Date.now() - startTime;

      this.logger.log(
        JSON.stringify({
          event: 'format_job_processing_completed',
          jobId,
          consultationId,
          finalNoteId,
          provider: providerUsed,
          model: modelUsed,
          durationMs,
          traceId,
        }),
      );

      await this.publishEvent({
        formatJobId: jobId,
        consultationId,
        episodeId,
        finalNoteId,
        status: 'completed',
        traceId,
      });
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorCode = this.classifyErrorCode(error);
      const isRetryable = this.isRetryableError(error);
      const attemptNumber = job.attemptsMade ?? 0;
      const maxAttempts =
        this.configService.get<number>('CLINICAL_NOTE_FORMAT_MAX_ATTEMPTS') ??
        3;

      // Only mark as failed if:
      // 1. Error is not retryable (auth/config errors)
      // 2. We've exhausted all retry attempts
      const shouldMarkFailed = !isRetryable || attemptNumber >= maxAttempts - 1;

      if (shouldMarkFailed) {
        const provider = providerEffective === 'openai' ? 'openai' : 'dummy';
        const model =
          provider === 'openai'
            ? (this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini')
            : null;

        // Mark job as failed
        await this.prisma.clinicalNoteFormatJob.update({
          where: { id: jobId },
          data: {
            status: ClinicalNoteFormatJobStatus.failed,
            finishedAt: new Date(),
            errorCode,
            errorMessage: this.sanitizeErrorMessage(errorMessage),
            provider,
            model,
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
            retryable: isRetryable,
            attemptNumber,
            maxAttempts,
            traceId,
          }),
        );

        await this.publishEvent({
          formatJobId: jobId,
          consultationId,
          episodeId,
          finalNoteId,
          status: 'failed',
          traceId,
          error: {
            code: errorCode,
            message: this.sanitizeErrorMessage(errorMessage),
          },
        });
      } else {
        // Retryable error, log but don't mark as failed yet
        this.logger.warn(
          JSON.stringify({
            event: 'format_job_processing_retry',
            jobId,
            consultationId,
            finalNoteId,
            durationMs,
            error: errorMessage,
            errorCode,
            retryable: true,
            attemptNumber,
            maxAttempts,
            traceId,
          }),
        );
      }

      throw error; // Re-throw to trigger retry (if retryable)
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

  private classifyErrorCode(error: unknown): string {
    if (error instanceof Error) {
      // Check for OpenAI-specific errors
      if ('status' in error) {
        const status = (error as { status?: number }).status;
        if (status === 401 || status === 403) {
          return 'AUTHENTICATION_ERROR';
        }
        if (status === 429) {
          return 'RATE_LIMIT_ERROR';
        }
        if (status && status >= 500) {
          return 'SERVER_ERROR';
        }
        if (status === 408 || error.message.includes('timeout')) {
          return 'TIMEOUT_ERROR';
        }
      }

      // Check error message patterns
      if (
        error.message.includes('invalid_request') ||
        error.name === 'InvalidRequestError'
      ) {
        return 'INVALID_REQUEST';
      }
      if (
        error.message.includes('rate_limit') ||
        error.name === 'RateLimitError'
      ) {
        return 'RATE_LIMIT_ERROR';
      }
      if (error.message.includes('timeout') || error.name === 'TimeoutError') {
        return 'TIMEOUT_ERROR';
      }
      if (
        error.name === 'NotFoundError' ||
        error.message.includes('not found')
      ) {
        return 'NOT_FOUND';
      }

      return error.name || 'UNKNOWN_ERROR';
    }

    return 'UNKNOWN_ERROR';
  }

  private isRetryableError(error: unknown): boolean {
    const errorCode = this.classifyErrorCode(error);
    // Non-retryable: auth errors, invalid requests, not found
    const nonRetryableCodes = [
      'AUTHENTICATION_ERROR',
      'INVALID_REQUEST',
      'NOT_FOUND',
    ];
    return !nonRetryableCodes.includes(errorCode);
  }

  private sanitizeErrorMessage(message: string): string {
    // Remove any potential PHI or sensitive data from error messages
    // Keep it short and safe
    const maxLength = 500;
    if (message.length > maxLength) {
      return message.substring(0, maxLength) + '...';
    }
    return message;
  }

  private async publishEvent(payload: FormatJobEventPayload) {
    try {
      await this.eventsPublisher.publish(payload);
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'format_job_event_publish_failed',
          formatJobId: payload.formatJobId,
          consultationId: payload.consultationId,
          status: payload.status,
          error: error instanceof Error ? error.message : String(error),
          traceId: payload.traceId ?? null,
        }),
      );
    }
  }

  private getProviderName(provider: FormatterProvider): 'openai' | 'dummy' {
    return provider instanceof OpenAiFormatterProvider ? 'openai' : 'dummy';
  }

  private getConfiguredProvider(): string {
    return (
      this.configService.get<string>('FORMATTER_PROVIDER') ??
      this.configService.get<string>('CLINICAL_NOTE_FORMAT_PROVIDER') ??
      'dummy'
    );
  }
}
