import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
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
import { UserRole } from '@prisma/client';
import { ProblemDetailsDto } from '../../common/docs/problem-details.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { Actor } from '../../common/types/actor.type';
import { PatientIdentityDto } from './docs/patient-identity.dto';
import { PatientIdentityPatchDto } from './dto/patient-identity-patch.dto';
import { PatientsIdentityService } from './patients-identity.service';

@ApiTags('patients')
@Controller('patients/me/identity')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.patient)
@ApiBearerAuth('access-token')
export class PatientsIdentityController {
  constructor(private readonly identityService: PatientsIdentityService) {}

  @Get()
  @ApiOperation({ summary: 'Get current patient identity' })
  @ApiOkResponse({ type: PatientIdentityDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async getIdentity(@CurrentUser() actor: Actor) {
    return this.identityService.getIdentity(actor.id);
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
  ) {
    return this.identityService.upsertIdentity(actor.id, dto);
  }
}
