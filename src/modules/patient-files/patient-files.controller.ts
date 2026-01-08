import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
  ApiConflictResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ProblemDetailsDto } from '../../common/docs/problem-details.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { Actor } from '../../common/types/actor.type';
import { PatientFilesService } from './patient-files.service';
import { PrepareUploadDto } from './dto/prepare-upload.dto';
import { ConfirmUploadDto } from './dto/confirm-upload.dto';
import { ListFilesQueryDto } from './dto/list-files-query.dto';
import { PrepareUploadResponseDto } from './docs/prepare-upload-response.dto';
import { ConfirmUploadResponseDto } from './docs/confirm-upload-response.dto';
import { DownloadResponseDto } from './docs/download-response.dto';
import { ListFilesResponseDto } from './docs/list-files-response.dto';
import { PatientFileDto } from './docs/patient-file.dto';
import { DeleteResponseDto } from './docs/delete-response.dto';

/**
 * Patient Files Controller
 *
 * Routes:
 * - For patients (self): /patients/me/files/*
 * - For doctors (on behalf of patient): /patients/:patientId/files/*
 *
 * Both routes share the same service logic, but access is controlled by
 * PatientFilesAccessService which enforces:
 * - Patient: can only access their own files (actor.id)
 * - Doctor: can access files of patients they have consulted with
 * - Admin: FORBIDDEN (no access to patient file content)
 */
@ApiTags('PatientFiles')
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ type: ProblemDetailsDto })
@ApiForbiddenResponse({ type: ProblemDetailsDto })
export class PatientFilesController {
  constructor(private readonly patientFilesService: PatientFilesService) {}

  // ==================== PATIENT ROUTES (self) ====================

  @Post('patients/me/files/prepare')
  @Roles(UserRole.patient)
  @ApiOperation({
    summary: 'Prepare file upload (patient)',
    description:
      'Creates a PatientFile in pending_upload status and returns a presigned upload URL. After uploading, call confirm to mark as ready.',
  })
  @ApiBody({ type: PrepareUploadDto })
  @ApiOkResponse({ type: PrepareUploadResponseDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  async prepareUploadPatient(
    @CurrentUser() actor: Actor,
    @Body() dto: PrepareUploadDto,
    @Req() req: Request,
  ) {
    return this.patientFilesService.prepareUpload(
      actor,
      actor.id, // Patient uses their own userId
      dto,
      (req as Request & { traceId?: string }).traceId ?? null,
    );
  }

  @Post('patients/me/files/:patientFileId/confirm')
  @Roles(UserRole.patient)
  @ApiOperation({
    summary: 'Confirm file upload (patient)',
    description:
      'Confirms that the file upload is complete and marks the PatientFile as ready. SHA-256 must match if provided in prepare.',
  })
  @ApiBody({ type: ConfirmUploadDto })
  @ApiOkResponse({ type: ConfirmUploadResponseDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async confirmUploadPatient(
    @CurrentUser() actor: Actor,
    @Param('patientFileId') patientFileId: string,
    @Body() dto: ConfirmUploadDto,
    @Req() req: Request,
  ) {
    return this.patientFilesService.confirmUpload(
      actor,
      actor.id, // Patient uses their own userId
      patientFileId,
      dto,
      (req as Request & { traceId?: string }).traceId ?? null,
    );
  }

  @Get('patients/me/files')
  @Roles(UserRole.patient)
  @ApiOperation({
    summary: 'List patient files (patient)',
    description:
      'Lists files for the current patient with pagination and optional filters.',
  })
  @ApiOkResponse({ type: ListFilesResponseDto })
  @ApiQuery({ type: ListFilesQueryDto, required: false })
  async listFilesPatient(
    @CurrentUser() actor: Actor,
    @Query() query: ListFilesQueryDto,
    @Req() req: Request,
  ) {
    return this.patientFilesService.listFiles(
      actor,
      actor.id, // Patient uses their own userId
      query,
      (req as Request & { traceId?: string }).traceId ?? null,
    );
  }

  @Get('patients/me/files/:patientFileId')
  @Roles(UserRole.patient)
  @ApiOperation({
    summary: 'Get patient file metadata (patient)',
    description:
      'Returns metadata for a specific patient file (no download URL).',
  })
  @ApiOkResponse({ type: PatientFileDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  async getFilePatient(
    @CurrentUser() actor: Actor,
    @Param('patientFileId') patientFileId: string,
    @Req() req: Request,
  ) {
    return this.patientFilesService.getFile(
      actor,
      actor.id, // Patient uses their own userId
      patientFileId,
      (req as Request & { traceId?: string }).traceId ?? null,
    );
  }

  @Get('patients/me/files/:patientFileId/download')
  @Roles(UserRole.patient)
  @ApiOperation({
    summary: 'Get download URL (patient)',
    description:
      'Returns a presigned download URL for a patient file. File must be in ready status.',
  })
  @ApiOkResponse({ type: DownloadResponseDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  async downloadFilePatient(
    @CurrentUser() actor: Actor,
    @Param('patientFileId') patientFileId: string,
    @Req() req: Request,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.patientFilesService.getDownloadUrl(
      actor,
      actor.id, // Patient uses their own userId
      patientFileId,
      (req as Request & { traceId?: string }).traceId ?? null,
      req.ip,
      userAgent,
    );
  }

  @Delete('patients/me/files/:patientFileId')
  @Roles(UserRole.patient)
  @ApiOperation({
    summary: 'Delete patient file (patient)',
    description: 'Soft deletes a patient file (marks as deleted status).',
  })
  @ApiOkResponse({ type: DeleteResponseDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  async deleteFilePatient(
    @CurrentUser() actor: Actor,
    @Param('patientFileId') patientFileId: string,
    @Req() req: Request,
  ) {
    return this.patientFilesService.deleteFile(
      actor,
      actor.id, // Patient uses their own userId
      patientFileId,
      (req as Request & { traceId?: string }).traceId ?? null,
    );
  }

  // ==================== DOCTOR ROUTES (on behalf of patient) ====================

  @Post('patients/:patientId/files/prepare')
  @Roles(UserRole.doctor)
  @ApiOperation({
    summary: 'Prepare file upload (doctor)',
    description:
      'Creates a PatientFile in pending_upload status and returns a presigned upload URL. Doctor must have at least one Consultation with the patient.',
  })
  @ApiBody({ type: PrepareUploadDto })
  @ApiOkResponse({ type: PrepareUploadResponseDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  async prepareUploadDoctor(
    @CurrentUser() actor: Actor,
    @Param('patientId') patientId: string,
    @Body() dto: PrepareUploadDto,
    @Req() req: Request,
  ) {
    return this.patientFilesService.prepareUpload(
      actor,
      patientId,
      dto,
      (req as Request & { traceId?: string }).traceId ?? null,
    );
  }

  @Post('patients/:patientId/files/:patientFileId/confirm')
  @Roles(UserRole.doctor)
  @ApiOperation({
    summary: 'Confirm file upload (doctor)',
    description:
      'Confirms that the file upload is complete and marks the PatientFile as ready. Doctor must have access to the patient.',
  })
  @ApiBody({ type: ConfirmUploadDto })
  @ApiOkResponse({ type: ConfirmUploadResponseDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async confirmUploadDoctor(
    @CurrentUser() actor: Actor,
    @Param('patientId') patientId: string,
    @Param('patientFileId') patientFileId: string,
    @Body() dto: ConfirmUploadDto,
    @Req() req: Request,
  ) {
    return this.patientFilesService.confirmUpload(
      actor,
      patientId,
      patientFileId,
      dto,
      (req as Request & { traceId?: string }).traceId ?? null,
    );
  }

  @Get('patients/:patientId/files')
  @Roles(UserRole.doctor)
  @ApiOperation({
    summary: 'List patient files (doctor)',
    description:
      'Lists files for a patient with pagination and optional filters. Doctor must have at least one Consultation with the patient.',
  })
  @ApiOkResponse({ type: ListFilesResponseDto })
  @ApiQuery({ type: ListFilesQueryDto, required: false })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  async listFilesDoctor(
    @CurrentUser() actor: Actor,
    @Param('patientId') patientId: string,
    @Query() query: ListFilesQueryDto,
    @Req() req: Request,
  ) {
    return this.patientFilesService.listFiles(
      actor,
      patientId,
      query,
      (req as Request & { traceId?: string }).traceId ?? null,
    );
  }

  @Get('patients/:patientId/files/:patientFileId')
  @Roles(UserRole.doctor)
  @ApiOperation({
    summary: 'Get patient file metadata (doctor)',
    description:
      'Returns metadata for a specific patient file. Doctor must have access to the patient.',
  })
  @ApiOkResponse({ type: PatientFileDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  async getFileDoctor(
    @CurrentUser() actor: Actor,
    @Param('patientId') patientId: string,
    @Param('patientFileId') patientFileId: string,
    @Req() req: Request,
  ) {
    return this.patientFilesService.getFile(
      actor,
      patientId,
      patientFileId,
      (req as Request & { traceId?: string }).traceId ?? null,
    );
  }

  @Get('patients/:patientId/files/:patientFileId/download')
  @Roles(UserRole.doctor)
  @ApiOperation({
    summary: 'Get download URL (doctor)',
    description:
      'Returns a presigned download URL for a patient file. Doctor must have access to the patient.',
  })
  @ApiOkResponse({ type: DownloadResponseDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  async downloadFileDoctor(
    @CurrentUser() actor: Actor,
    @Param('patientId') patientId: string,
    @Param('patientFileId') patientFileId: string,
    @Req() req: Request,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.patientFilesService.getDownloadUrl(
      actor,
      patientId,
      patientFileId,
      (req as Request & { traceId?: string }).traceId ?? null,
      req.ip,
      userAgent,
    );
  }

  @Delete('patients/:patientId/files/:patientFileId')
  @Roles(UserRole.doctor)
  @ApiOperation({
    summary: 'Delete patient file (doctor)',
    description:
      'Soft deletes a patient file. Doctor must have access to the patient.',
  })
  @ApiOkResponse({ type: DeleteResponseDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  async deleteFileDoctor(
    @CurrentUser() actor: Actor,
    @Param('patientId') patientId: string,
    @Param('patientFileId') patientFileId: string,
    @Req() req: Request,
  ) {
    return this.patientFilesService.deleteFile(
      actor,
      patientId,
      patientFileId,
      (req as Request & { traceId?: string }).traceId ?? null,
    );
  }
}
