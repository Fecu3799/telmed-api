import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { AuditAction, UserRole } from '@prisma/client';
import type { Request } from 'express';
import { ProblemDetailsDto } from '../../common/docs/problem-details.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { Actor } from '../../common/types/actor.type';
import { AuditService } from '../../infra/audit/audit.service';
import { PatientIdentityDto } from './docs/patient-identity.dto';
import { PatientIdentityPatchDto } from './dto/patient-identity-patch.dto';
import { PatientsIdentityService } from './patients-identity.service';

/**
 * Identidad legal del paciente:
 * - Expone endpoints para que un paciente gestione su identidad legal (leer y upsert) bajo
 *   /api/patients/me/identity, con RBAC patient y audit log de lectura/escritura.
 *
 * How it works:
 * - GET /patients/me/identity: pide a PatientsIdentityService.getIdentity(actor.id)
 *   y luego registra un audit READ con resourceType=PatientIdentity, resourceId, actor, traceId, ip, userAgent.
 * - PATCH /patients/me/identity: llama a upsertIdentity(actor.id, dto) y registra audit
 *   WRITE con metadata.fields=keys del DTO para saber qué cambió.
 */

@ApiTags('patients')
@Controller('patients/me/identity')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.patient)
@ApiBearerAuth('access-token')
export class PatientsIdentityController {
  constructor(
    private readonly identityService: PatientsIdentityService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get current patient identity' })
  @ApiOkResponse({ type: PatientIdentityDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async getIdentity(@CurrentUser() actor: Actor, @Req() req: Request) {
    const identity = await this.identityService.getIdentity(actor.id);
    // Audit reads for compliance and support diagnostics.
    await this.auditService.log({
      action: AuditAction.READ,
      resourceType: 'PatientIdentity',
      resourceId: identity.id,
      actor,
      traceId: (req as Request & { traceId?: string }).traceId ?? null,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
    });
    return identity;
  }

  @Patch()
  @ApiOperation({
    summary: 'Upsert current patient identity',
    description:
      'First-time creation requires legalFirstName, legalLastName, documentType, documentNumber, documentCountry and birthDate.',
  })
  @ApiBody({ type: PatientIdentityPatchDto })
  @ApiOkResponse({ type: PatientIdentityDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async patchIdentity(
    @CurrentUser() actor: Actor,
    @Body() dto: PatientIdentityPatchDto,
    @Req() req: Request,
  ) {
    const identity = await this.identityService.upsertIdentity(actor.id, dto);
    // Audit identity mutations to track legal data updates.
    await this.auditService.log({
      action: AuditAction.WRITE,
      resourceType: 'PatientIdentity',
      resourceId: identity.id,
      actor,
      traceId: (req as Request & { traceId?: string }).traceId ?? null,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
      metadata: { fields: Object.keys(dto) },
    });
    return identity;
  }
}
