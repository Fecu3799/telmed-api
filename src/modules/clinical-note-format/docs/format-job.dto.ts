import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClinicalNoteFormatJobStatus } from '@prisma/client';

/**
 * Format job proposal DTO.
 * What it does:
 * - Represents a single proposal variant (A, B, or C) with title and body.
 * How it works:
 * - Used in job response when status is completed.
 * Gotchas:
 * - Title is optional; body is always present.
 */
export class FormatJobProposalDto {
  @ApiPropertyOptional({ example: 'Resumen de consulta' })
  title?: string | null;

  @ApiProperty({ example: 'Formatted clinical note body...' })
  body!: string;
}

/**
 * Format job proposals map DTO.
 * What it does:
 * - Contains all three proposal variants (A, B, C) when job is completed.
 * How it works:
 * - Only included in response when status is 'completed'.
 * Gotchas:
 * - Variants may be missing if job failed or is incomplete.
 */
export class FormatJobProposalsDto {
  @ApiPropertyOptional({ type: FormatJobProposalDto })
  A?: FormatJobProposalDto;

  @ApiPropertyOptional({ type: FormatJobProposalDto })
  B?: FormatJobProposalDto;

  @ApiPropertyOptional({ type: FormatJobProposalDto })
  C?: FormatJobProposalDto;
}

/**
 * Format job error DTO.
 * What it does:
 * - Error information when job status is 'failed'.
 * How it works:
 * - Includes error code and message for debugging.
 * Gotchas:
 * - Only present when status is 'failed'.
 */
export class FormatJobErrorDto {
  @ApiPropertyOptional({ example: 'PROVIDER_ERROR' })
  code?: string | null;

  @ApiPropertyOptional({ example: 'Failed to generate proposals' })
  message?: string | null;
}

/**
 * Format job response DTO.
 * What it does:
 * - Complete format job information including status, proposals, and metadata.
 * How it works:
 * - Returned by GET endpoint; proposals only when completed.
 * Gotchas:
 * - Proposals and error are mutually exclusive based on status.
 */
export class FormatJobDto {
  @ApiProperty({ example: 'b9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  id!: string;

  @ApiProperty({ example: 'completed', enum: ClinicalNoteFormatJobStatus })
  status!: ClinicalNoteFormatJobStatus;

  @ApiProperty({ example: 'standard' })
  preset!: string;

  @ApiPropertyOptional({ example: { length: 'medium', bullets: true } })
  options?: Record<string, unknown> | null;

  @ApiProperty({ example: 1 })
  promptVersion!: number;

  @ApiProperty({ example: '2025-01-26T23:00:00.000Z' })
  createdAt!: string;

  @ApiPropertyOptional({ example: '2025-01-26T23:00:05.000Z' })
  startedAt?: string | null;

  @ApiPropertyOptional({ example: '2025-01-26T23:00:10.000Z' })
  finishedAt?: string | null;

  @ApiPropertyOptional({ type: FormatJobProposalsDto })
  proposals?: FormatJobProposalsDto;

  @ApiPropertyOptional({ type: FormatJobErrorDto })
  error?: FormatJobErrorDto;
}

/**
 * Create format job response DTO.
 * What it does:
 * - Response for POST endpoint creating a format job.
 * How it works:
 * - Returns job ID and status (typically 'queued').
 * Gotchas:
 * - May return existing job if inputHash matches.
 */
export class CreateFormatJobResponseDto {
  @ApiProperty({ example: 'b9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  jobId!: string;

  @ApiProperty({ example: 'queued', enum: ClinicalNoteFormatJobStatus })
  status!: ClinicalNoteFormatJobStatus;
}
