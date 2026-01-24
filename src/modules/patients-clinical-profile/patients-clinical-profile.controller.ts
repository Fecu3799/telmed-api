import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { AuditAction, UserRole } from '@prisma/client';
import { ProblemDetailsDto } from '../../common/docs/problem-details.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { Actor } from '../../common/types/actor.type';
import { AuditService } from '../../infra/audit/audit.service';
import { ClinicalAllergyDto } from './docs/clinical-allergy.dto';
import { ClinicalAllergiesResponseDto } from './docs/clinical-allergies-response.dto';
import { ClinicalMedicationDto } from './docs/clinical-medication.dto';
import { ClinicalMedicationsResponseDto } from './docs/clinical-medications-response.dto';
import { ClinicalConditionDto } from './docs/clinical-condition.dto';
import { ClinicalConditionsResponseDto } from './docs/clinical-conditions-response.dto';
import { ClinicalProcedureDto } from './docs/clinical-procedure.dto';
import { ClinicalProceduresResponseDto } from './docs/clinical-procedures-response.dto';
import { ClinicalAllergyCreateDto } from './dto/clinical-allergy-create.dto';
import { ClinicalAllergyListQueryDto } from './dto/clinical-allergy-list-query.dto';
import { ClinicalAllergyPatchDto } from './dto/clinical-allergy-patch.dto';
import { ClinicalAllergyVerifyDto } from './dto/clinical-allergy-verify.dto';
import { ClinicalMedicationCreateDto } from './dto/clinical-medication-create.dto';
import { ClinicalMedicationListQueryDto } from './dto/clinical-medication-list-query.dto';
import { ClinicalMedicationPatchDto } from './dto/clinical-medication-patch.dto';
import { ClinicalMedicationVerifyDto } from './dto/clinical-medication-verify.dto';
import { ClinicalConditionCreateDto } from './dto/clinical-condition-create.dto';
import { ClinicalConditionListQueryDto } from './dto/clinical-condition-list-query.dto';
import { ClinicalConditionPatchDto } from './dto/clinical-condition-patch.dto';
import { ClinicalConditionVerifyDto } from './dto/clinical-condition-verify.dto';
import { ClinicalProcedureCreateDto } from './dto/clinical-procedure-create.dto';
import { ClinicalProcedureListQueryDto } from './dto/clinical-procedure-list-query.dto';
import { ClinicalProcedurePatchDto } from './dto/clinical-procedure-patch.dto';
import { ClinicalProcedureVerifyDto } from './dto/clinical-procedure-verify.dto';
import { PatientsClinicalProfileService } from './patients-clinical-profile.service';

@ApiTags('patients')
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ type: ProblemDetailsDto })
@ApiForbiddenResponse({ type: ProblemDetailsDto })
@ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
export class PatientsClinicalProfileController {
  constructor(
    private readonly clinicalProfileService: PatientsClinicalProfileService,
    private readonly auditService: AuditService,
  ) {}

  // ==================== PATIENT ROUTES (self) ====================

  @Get('patients/me/clinical-profile/allergies')
  @Roles(UserRole.patient)
  @ApiOperation({ summary: 'List patient allergies (patient)' })
  @ApiOkResponse({ type: ClinicalAllergiesResponseDto })
  @ApiQuery({ type: ClinicalAllergyListQueryDto, required: false })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async listAllergiesPatient(
    @CurrentUser() actor: Actor,
    @Query() query: ClinicalAllergyListQueryDto,
    @Req() req: Request,
  ) {
    const result = await this.clinicalProfileService.listAllergiesForPatient(
      actor,
      query,
    );

    await this.auditService.log({
      action: AuditAction.READ,
      resourceType: 'PatientClinicalAllergy',
      resourceId: 'list',
      actor,
      traceId: (req as Request & { traceId?: string }).traceId ?? null,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
      metadata: {
        patientUserId: actor.id,
        page: result.pageInfo.page,
        pageSize: result.pageInfo.pageSize,
      },
    });

    return result;
  }

  @Post('patients/me/clinical-profile/allergies')
  @Roles(UserRole.patient)
  @ApiOperation({ summary: 'Create allergy (patient)' })
  @ApiBody({ type: ClinicalAllergyCreateDto })
  @ApiOkResponse({ type: ClinicalAllergyDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async createAllergyPatient(
    @CurrentUser() actor: Actor,
    @Body() dto: ClinicalAllergyCreateDto,
    @Req() req: Request,
  ) {
    const allergy = await this.clinicalProfileService.createAllergyForPatient(
      actor,
      dto,
    );

    await this.auditService.log({
      action: AuditAction.WRITE,
      resourceType: 'PatientClinicalAllergy',
      resourceId: allergy.id,
      actor,
      traceId: (req as Request & { traceId?: string }).traceId ?? null,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
      metadata: {
        patientUserId: actor.id,
        changedFields: Object.keys(dto),
      },
    });

    return allergy;
  }

  @Patch('patients/me/clinical-profile/allergies/:allergyId')
  @Roles(UserRole.patient)
  @ApiOperation({ summary: 'Update allergy (patient)' })
  @ApiBody({ type: ClinicalAllergyPatchDto })
  @ApiOkResponse({ type: ClinicalAllergyDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async updateAllergyPatient(
    @CurrentUser() actor: Actor,
    @Param('allergyId') allergyId: string,
    @Body() dto: ClinicalAllergyPatchDto,
    @Req() req: Request,
  ) {
    const allergy = await this.clinicalProfileService.updateAllergyForPatient(
      actor,
      allergyId,
      dto,
    );

    await this.auditService.log({
      action: AuditAction.WRITE,
      resourceType: 'PatientClinicalAllergy',
      resourceId: allergy.id,
      actor,
      traceId: (req as Request & { traceId?: string }).traceId ?? null,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
      metadata: {
        patientUserId: actor.id,
        changedFields: Object.keys(dto),
      },
    });

    return allergy;
  }

  @Delete('patients/me/clinical-profile/allergies/:allergyId')
  @Roles(UserRole.patient)
  @ApiOperation({ summary: 'Delete allergy (patient)' })
  @ApiOkResponse({ type: ClinicalAllergyDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  async deleteAllergyPatient(
    @CurrentUser() actor: Actor,
    @Param('allergyId') allergyId: string,
    @Req() req: Request,
  ) {
    const allergy = await this.clinicalProfileService.deleteAllergyForPatient(
      actor,
      allergyId,
    );

    await this.auditService.log({
      action: AuditAction.WRITE,
      resourceType: 'PatientClinicalAllergy',
      resourceId: allergy.id,
      actor,
      traceId: (req as Request & { traceId?: string }).traceId ?? null,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
      metadata: {
        patientUserId: actor.id,
        changedFields: ['deletedAt'],
      },
    });

    return allergy;
  }

  @Get('patients/me/clinical-profile/medications')
  @Roles(UserRole.patient)
  @ApiOperation({ summary: 'List patient medications (patient)' })
  @ApiOkResponse({ type: ClinicalMedicationsResponseDto })
  @ApiQuery({ type: ClinicalMedicationListQueryDto, required: false })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async listMedicationsPatient(
    @CurrentUser() actor: Actor,
    @Query() query: ClinicalMedicationListQueryDto,
    @Req() req: Request,
  ) {
    const result = await this.clinicalProfileService.listMedicationsForPatient(
      actor,
      query,
    );

    await this.auditService.log({
      action: AuditAction.READ,
      resourceType: 'PatientClinicalMedication',
      resourceId: 'list',
      actor,
      traceId: (req as Request & { traceId?: string }).traceId ?? null,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
      metadata: {
        patientUserId: actor.id,
        page: result.pageInfo.page,
        pageSize: result.pageInfo.pageSize,
      },
    });

    return result;
  }

  @Post('patients/me/clinical-profile/medications')
  @Roles(UserRole.patient)
  @ApiOperation({ summary: 'Create medication (patient)' })
  @ApiBody({ type: ClinicalMedicationCreateDto })
  @ApiOkResponse({ type: ClinicalMedicationDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async createMedicationPatient(
    @CurrentUser() actor: Actor,
    @Body() dto: ClinicalMedicationCreateDto,
    @Req() req: Request,
  ) {
    const medication =
      await this.clinicalProfileService.createMedicationForPatient(actor, dto);

    await this.auditService.log({
      action: AuditAction.WRITE,
      resourceType: 'PatientClinicalMedication',
      resourceId: medication.id,
      actor,
      traceId: (req as Request & { traceId?: string }).traceId ?? null,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
      metadata: {
        patientUserId: actor.id,
        changedFields: Object.keys(dto),
      },
    });

    return medication;
  }

  @Patch('patients/me/clinical-profile/medications/:medicationId')
  @Roles(UserRole.patient)
  @ApiOperation({ summary: 'Update medication (patient)' })
  @ApiBody({ type: ClinicalMedicationPatchDto })
  @ApiOkResponse({ type: ClinicalMedicationDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async updateMedicationPatient(
    @CurrentUser() actor: Actor,
    @Param('medicationId') medicationId: string,
    @Body() dto: ClinicalMedicationPatchDto,
    @Req() req: Request,
  ) {
    const medication =
      await this.clinicalProfileService.updateMedicationForPatient(
        actor,
        medicationId,
        dto,
      );

    await this.auditService.log({
      action: AuditAction.WRITE,
      resourceType: 'PatientClinicalMedication',
      resourceId: medication.id,
      actor,
      traceId: (req as Request & { traceId?: string }).traceId ?? null,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
      metadata: {
        patientUserId: actor.id,
        changedFields: Object.keys(dto),
      },
    });

    return medication;
  }

  @Delete('patients/me/clinical-profile/medications/:medicationId')
  @Roles(UserRole.patient)
  @ApiOperation({ summary: 'Delete medication (patient)' })
  @ApiOkResponse({ type: ClinicalMedicationDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  async deleteMedicationPatient(
    @CurrentUser() actor: Actor,
    @Param('medicationId') medicationId: string,
    @Req() req: Request,
  ) {
    const medication =
      await this.clinicalProfileService.deleteMedicationForPatient(
        actor,
        medicationId,
      );

    await this.auditService.log({
      action: AuditAction.WRITE,
      resourceType: 'PatientClinicalMedication',
      resourceId: medication.id,
      actor,
      traceId: (req as Request & { traceId?: string }).traceId ?? null,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
      metadata: {
        patientUserId: actor.id,
        changedFields: ['deletedAt'],
      },
    });

    return medication;
  }

  @Get('patients/me/clinical-profile/conditions')
  @Roles(UserRole.patient)
  @ApiOperation({ summary: 'List patient conditions (patient)' })
  @ApiOkResponse({ type: ClinicalConditionsResponseDto })
  @ApiQuery({ type: ClinicalConditionListQueryDto, required: false })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async listConditionsPatient(
    @CurrentUser() actor: Actor,
    @Query() query: ClinicalConditionListQueryDto,
    @Req() req: Request,
  ) {
    const result = await this.clinicalProfileService.listConditionsForPatient(
      actor,
      query,
    );

    await this.auditService.log({
      action: AuditAction.READ,
      resourceType: 'PatientClinicalCondition',
      resourceId: 'list',
      actor,
      traceId: (req as Request & { traceId?: string }).traceId ?? null,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
      metadata: {
        patientUserId: actor.id,
        page: result.pageInfo.page,
        pageSize: result.pageInfo.pageSize,
      },
    });

    return result;
  }

  @Post('patients/me/clinical-profile/conditions')
  @Roles(UserRole.patient)
  @ApiOperation({ summary: 'Create condition (patient)' })
  @ApiBody({ type: ClinicalConditionCreateDto })
  @ApiOkResponse({ type: ClinicalConditionDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async createConditionPatient(
    @CurrentUser() actor: Actor,
    @Body() dto: ClinicalConditionCreateDto,
    @Req() req: Request,
  ) {
    const condition =
      await this.clinicalProfileService.createConditionForPatient(actor, dto);

    await this.auditService.log({
      action: AuditAction.WRITE,
      resourceType: 'PatientClinicalCondition',
      resourceId: condition.id,
      actor,
      traceId: (req as Request & { traceId?: string }).traceId ?? null,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
      metadata: {
        patientUserId: actor.id,
        changedFields: Object.keys(dto),
      },
    });

    return condition;
  }

  @Patch('patients/me/clinical-profile/conditions/:conditionId')
  @Roles(UserRole.patient)
  @ApiOperation({ summary: 'Update condition (patient)' })
  @ApiBody({ type: ClinicalConditionPatchDto })
  @ApiOkResponse({ type: ClinicalConditionDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async updateConditionPatient(
    @CurrentUser() actor: Actor,
    @Param('conditionId') conditionId: string,
    @Body() dto: ClinicalConditionPatchDto,
    @Req() req: Request,
  ) {
    const condition =
      await this.clinicalProfileService.updateConditionForPatient(
        actor,
        conditionId,
        dto,
      );

    await this.auditService.log({
      action: AuditAction.WRITE,
      resourceType: 'PatientClinicalCondition',
      resourceId: condition.id,
      actor,
      traceId: (req as Request & { traceId?: string }).traceId ?? null,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
      metadata: {
        patientUserId: actor.id,
        changedFields: Object.keys(dto),
      },
    });

    return condition;
  }

  @Delete('patients/me/clinical-profile/conditions/:conditionId')
  @Roles(UserRole.patient)
  @ApiOperation({ summary: 'Delete condition (patient)' })
  @ApiOkResponse({ type: ClinicalConditionDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  async deleteConditionPatient(
    @CurrentUser() actor: Actor,
    @Param('conditionId') conditionId: string,
    @Req() req: Request,
  ) {
    const condition =
      await this.clinicalProfileService.deleteConditionForPatient(
        actor,
        conditionId,
      );

    await this.auditService.log({
      action: AuditAction.WRITE,
      resourceType: 'PatientClinicalCondition',
      resourceId: condition.id,
      actor,
      traceId: (req as Request & { traceId?: string }).traceId ?? null,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
      metadata: {
        patientUserId: actor.id,
        changedFields: ['deletedAt'],
      },
    });

    return condition;
  }

  @Get('patients/me/clinical-profile/procedures')
  @Roles(UserRole.patient)
  @ApiOperation({ summary: 'List patient procedures (patient)' })
  @ApiOkResponse({ type: ClinicalProceduresResponseDto })
  @ApiQuery({ type: ClinicalProcedureListQueryDto, required: false })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async listProceduresPatient(
    @CurrentUser() actor: Actor,
    @Query() query: ClinicalProcedureListQueryDto,
    @Req() req: Request,
  ) {
    const result = await this.clinicalProfileService.listProceduresForPatient(
      actor,
      query,
    );

    await this.auditService.log({
      action: AuditAction.READ,
      resourceType: 'PatientClinicalProcedure',
      resourceId: 'list',
      actor,
      traceId: (req as Request & { traceId?: string }).traceId ?? null,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
      metadata: {
        patientUserId: actor.id,
        page: result.pageInfo.page,
        pageSize: result.pageInfo.pageSize,
      },
    });

    return result;
  }

  @Post('patients/me/clinical-profile/procedures')
  @Roles(UserRole.patient)
  @ApiOperation({ summary: 'Create procedure (patient)' })
  @ApiBody({ type: ClinicalProcedureCreateDto })
  @ApiOkResponse({ type: ClinicalProcedureDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async createProcedurePatient(
    @CurrentUser() actor: Actor,
    @Body() dto: ClinicalProcedureCreateDto,
    @Req() req: Request,
  ) {
    const procedure =
      await this.clinicalProfileService.createProcedureForPatient(actor, dto);

    await this.auditService.log({
      action: AuditAction.WRITE,
      resourceType: 'PatientClinicalProcedure',
      resourceId: procedure.id,
      actor,
      traceId: (req as Request & { traceId?: string }).traceId ?? null,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
      metadata: {
        patientUserId: actor.id,
        changedFields: Object.keys(dto),
      },
    });

    return procedure;
  }

  @Patch('patients/me/clinical-profile/procedures/:procedureId')
  @Roles(UserRole.patient)
  @ApiOperation({ summary: 'Update procedure (patient)' })
  @ApiBody({ type: ClinicalProcedurePatchDto })
  @ApiOkResponse({ type: ClinicalProcedureDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async updateProcedurePatient(
    @CurrentUser() actor: Actor,
    @Param('procedureId') procedureId: string,
    @Body() dto: ClinicalProcedurePatchDto,
    @Req() req: Request,
  ) {
    const procedure =
      await this.clinicalProfileService.updateProcedureForPatient(
        actor,
        procedureId,
        dto,
      );

    await this.auditService.log({
      action: AuditAction.WRITE,
      resourceType: 'PatientClinicalProcedure',
      resourceId: procedure.id,
      actor,
      traceId: (req as Request & { traceId?: string }).traceId ?? null,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
      metadata: {
        patientUserId: actor.id,
        changedFields: Object.keys(dto),
      },
    });

    return procedure;
  }

  @Delete('patients/me/clinical-profile/procedures/:procedureId')
  @Roles(UserRole.patient)
  @ApiOperation({ summary: 'Delete procedure (patient)' })
  @ApiOkResponse({ type: ClinicalProcedureDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  async deleteProcedurePatient(
    @CurrentUser() actor: Actor,
    @Param('procedureId') procedureId: string,
    @Req() req: Request,
  ) {
    const procedure =
      await this.clinicalProfileService.deleteProcedureForPatient(
        actor,
        procedureId,
      );

    await this.auditService.log({
      action: AuditAction.WRITE,
      resourceType: 'PatientClinicalProcedure',
      resourceId: procedure.id,
      actor,
      traceId: (req as Request & { traceId?: string }).traceId ?? null,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
      metadata: {
        patientUserId: actor.id,
        changedFields: ['deletedAt'],
      },
    });

    return procedure;
  }

  // ==================== DOCTOR ROUTES ====================

  @Get('patients/:patientUserId/clinical-profile/allergies')
  @Roles(UserRole.doctor)
  @ApiOperation({ summary: 'List patient allergies (doctor)' })
  @ApiOkResponse({ type: ClinicalAllergiesResponseDto })
  @ApiQuery({ type: ClinicalAllergyListQueryDto, required: false })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async listAllergiesDoctor(
    @CurrentUser() actor: Actor,
    @Param('patientUserId') patientUserId: string,
    @Query() query: ClinicalAllergyListQueryDto,
    @Req() req: Request,
  ) {
    const result = await this.clinicalProfileService.listAllergiesForDoctor(
      actor,
      patientUserId,
      query,
    );

    await this.auditService.log({
      action: AuditAction.READ,
      resourceType: 'PatientClinicalAllergy',
      resourceId: 'list',
      actor,
      traceId: (req as Request & { traceId?: string }).traceId ?? null,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
      metadata: {
        patientUserId,
        page: result.pageInfo.page,
        pageSize: result.pageInfo.pageSize,
      },
    });

    return result;
  }

  @Patch('patients/:patientUserId/clinical-profile/allergies/:allergyId/verify')
  @Roles(UserRole.doctor)
  @ApiOperation({ summary: 'Verify or dispute allergy (doctor)' })
  @ApiBody({ type: ClinicalAllergyVerifyDto })
  @ApiOkResponse({ type: ClinicalAllergyDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async verifyAllergyDoctor(
    @CurrentUser() actor: Actor,
    @Param('patientUserId') patientUserId: string,
    @Param('allergyId') allergyId: string,
    @Body() dto: ClinicalAllergyVerifyDto,
    @Req() req: Request,
  ) {
    const allergy = await this.clinicalProfileService.verifyAllergyForDoctor(
      actor,
      patientUserId,
      allergyId,
      dto,
    );

    await this.auditService.log({
      action: AuditAction.VERIFY,
      resourceType: 'PatientClinicalAllergy',
      resourceId: allergy.id,
      actor,
      traceId: (req as Request & { traceId?: string }).traceId ?? null,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
      metadata: {
        patientUserId,
        newStatus: dto.verificationStatus,
      },
    });

    return allergy;
  }

  @Get('patients/:patientUserId/clinical-profile/medications')
  @Roles(UserRole.doctor)
  @ApiOperation({ summary: 'List patient medications (doctor)' })
  @ApiOkResponse({ type: ClinicalMedicationsResponseDto })
  @ApiQuery({ type: ClinicalMedicationListQueryDto, required: false })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async listMedicationsDoctor(
    @CurrentUser() actor: Actor,
    @Param('patientUserId') patientUserId: string,
    @Query() query: ClinicalMedicationListQueryDto,
    @Req() req: Request,
  ) {
    const result = await this.clinicalProfileService.listMedicationsForDoctor(
      actor,
      patientUserId,
      query,
    );

    await this.auditService.log({
      action: AuditAction.READ,
      resourceType: 'PatientClinicalMedication',
      resourceId: 'list',
      actor,
      traceId: (req as Request & { traceId?: string }).traceId ?? null,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
      metadata: {
        patientUserId,
        page: result.pageInfo.page,
        pageSize: result.pageInfo.pageSize,
      },
    });

    return result;
  }

  @Patch(
    'patients/:patientUserId/clinical-profile/medications/:medicationId/verify',
  )
  @Roles(UserRole.doctor)
  @ApiOperation({ summary: 'Verify or dispute medication (doctor)' })
  @ApiBody({ type: ClinicalMedicationVerifyDto })
  @ApiOkResponse({ type: ClinicalMedicationDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async verifyMedicationDoctor(
    @CurrentUser() actor: Actor,
    @Param('patientUserId') patientUserId: string,
    @Param('medicationId') medicationId: string,
    @Body() dto: ClinicalMedicationVerifyDto,
    @Req() req: Request,
  ) {
    const medication =
      await this.clinicalProfileService.verifyMedicationForDoctor(
        actor,
        patientUserId,
        medicationId,
        dto,
      );

    await this.auditService.log({
      action: AuditAction.VERIFY,
      resourceType: 'PatientClinicalMedication',
      resourceId: medication.id,
      actor,
      traceId: (req as Request & { traceId?: string }).traceId ?? null,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
      metadata: {
        patientUserId,
        newStatus: dto.verificationStatus,
      },
    });

    return medication;
  }

  @Get('patients/:patientUserId/clinical-profile/conditions')
  @Roles(UserRole.doctor)
  @ApiOperation({ summary: 'List patient conditions (doctor)' })
  @ApiOkResponse({ type: ClinicalConditionsResponseDto })
  @ApiQuery({ type: ClinicalConditionListQueryDto, required: false })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async listConditionsDoctor(
    @CurrentUser() actor: Actor,
    @Param('patientUserId') patientUserId: string,
    @Query() query: ClinicalConditionListQueryDto,
    @Req() req: Request,
  ) {
    const result = await this.clinicalProfileService.listConditionsForDoctor(
      actor,
      patientUserId,
      query,
    );

    await this.auditService.log({
      action: AuditAction.READ,
      resourceType: 'PatientClinicalCondition',
      resourceId: 'list',
      actor,
      traceId: (req as Request & { traceId?: string }).traceId ?? null,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
      metadata: {
        patientUserId,
        page: result.pageInfo.page,
        pageSize: result.pageInfo.pageSize,
      },
    });

    return result;
  }

  @Patch(
    'patients/:patientUserId/clinical-profile/conditions/:conditionId/verify',
  )
  @Roles(UserRole.doctor)
  @ApiOperation({ summary: 'Verify or dispute condition (doctor)' })
  @ApiBody({ type: ClinicalConditionVerifyDto })
  @ApiOkResponse({ type: ClinicalConditionDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async verifyConditionDoctor(
    @CurrentUser() actor: Actor,
    @Param('patientUserId') patientUserId: string,
    @Param('conditionId') conditionId: string,
    @Body() dto: ClinicalConditionVerifyDto,
    @Req() req: Request,
  ) {
    const condition =
      await this.clinicalProfileService.verifyConditionForDoctor(
        actor,
        patientUserId,
        conditionId,
        dto,
      );

    await this.auditService.log({
      action: AuditAction.VERIFY,
      resourceType: 'PatientClinicalCondition',
      resourceId: condition.id,
      actor,
      traceId: (req as Request & { traceId?: string }).traceId ?? null,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
      metadata: {
        patientUserId,
        newStatus: dto.verificationStatus,
      },
    });

    return condition;
  }

  @Get('patients/:patientUserId/clinical-profile/procedures')
  @Roles(UserRole.doctor)
  @ApiOperation({ summary: 'List patient procedures (doctor)' })
  @ApiOkResponse({ type: ClinicalProceduresResponseDto })
  @ApiQuery({ type: ClinicalProcedureListQueryDto, required: false })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async listProceduresDoctor(
    @CurrentUser() actor: Actor,
    @Param('patientUserId') patientUserId: string,
    @Query() query: ClinicalProcedureListQueryDto,
    @Req() req: Request,
  ) {
    const result = await this.clinicalProfileService.listProceduresForDoctor(
      actor,
      patientUserId,
      query,
    );

    await this.auditService.log({
      action: AuditAction.READ,
      resourceType: 'PatientClinicalProcedure',
      resourceId: 'list',
      actor,
      traceId: (req as Request & { traceId?: string }).traceId ?? null,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
      metadata: {
        patientUserId,
        page: result.pageInfo.page,
        pageSize: result.pageInfo.pageSize,
      },
    });

    return result;
  }

  @Patch(
    'patients/:patientUserId/clinical-profile/procedures/:procedureId/verify',
  )
  @Roles(UserRole.doctor)
  @ApiOperation({ summary: 'Verify or dispute procedure (doctor)' })
  @ApiBody({ type: ClinicalProcedureVerifyDto })
  @ApiOkResponse({ type: ClinicalProcedureDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async verifyProcedureDoctor(
    @CurrentUser() actor: Actor,
    @Param('patientUserId') patientUserId: string,
    @Param('procedureId') procedureId: string,
    @Body() dto: ClinicalProcedureVerifyDto,
    @Req() req: Request,
  ) {
    const procedure =
      await this.clinicalProfileService.verifyProcedureForDoctor(
        actor,
        patientUserId,
        procedureId,
        dto,
      );

    await this.auditService.log({
      action: AuditAction.VERIFY,
      resourceType: 'PatientClinicalProcedure',
      resourceId: procedure.id,
      actor,
      traceId: (req as Request & { traceId?: string }).traceId ?? null,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
      metadata: {
        patientUserId,
        newStatus: dto.verificationStatus,
      },
    });

    return procedure;
  }
}
