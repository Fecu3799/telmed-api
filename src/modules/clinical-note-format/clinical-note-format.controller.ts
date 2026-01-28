import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiAcceptedResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ProblemDetailsDto } from '../../common/docs/problem-details.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { Actor } from '../../common/types/actor.type';
import { ClinicalNoteFormatService } from './clinical-note-format.service';
import { CreateFormatJobDto } from './dto/create-format-job.dto';
import {
  CreateFormatJobResponseDto,
  FormatJobDto,
} from './docs/format-job.dto';

/**
 * Clinical note format jobs API.
 * What it does:
 * - Endpoints for creating and querying format jobs for clinical episode final notes.
 * How it works:
 * - POST creates/retrieves job and enqueues for processing.
 * - GET retrieves job status and proposals when completed.
 * Gotchas:
 * - Only doctor owner can create/view jobs; requires final note to exist.
 */
@ApiTags('consultations')
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.doctor)
@ApiBearerAuth('access-token')
export class ClinicalNoteFormatController {
  constructor(private readonly formatService: ClinicalNoteFormatService) {}

  @Post('consultations/:consultationId/clinical-episode/final/format-jobs')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Create format job for final note' })
  @ApiBody({ type: CreateFormatJobDto })
  @ApiAcceptedResponse({ type: CreateFormatJobResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async createFormatJob(
    @CurrentUser() actor: Actor,
    @Param('consultationId') consultationId: string,
    @Body() dto: CreateFormatJobDto,
  ) {
    const result = await this.formatService.createFormatJob(
      actor,
      consultationId,
      dto,
    );
    return result;
  }

  @Get('clinical-note-format-jobs/:jobId')
  @ApiOperation({ summary: 'Get format job status and proposals' })
  @ApiOkResponse({ type: FormatJobDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async getFormatJob(
    @CurrentUser() actor: Actor,
    @Param('jobId') jobId: string,
  ) {
    return this.formatService.getFormatJob(actor, jobId);
  }
}
