import { Body, Controller, Get, Patch, Put, UseGuards } from '@nestjs/common';
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
import { PatientProfileDto } from './docs/patient-profile.dto';
import { PatientProfilePatchDto } from './dto/patient-profile-patch.dto';
import { PatientProfilePutDto } from './dto/patient-profile-put.dto';
import { PatientProfilesService } from './patient-profiles.service';

@ApiTags('patients')
@Controller('patients/me/profile')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.patient)
@ApiBearerAuth('access-token')
export class PatientProfilesController {
  constructor(private readonly profilesService: PatientProfilesService) {}

  @Get()
  @ApiOperation({ summary: 'Get current patient profile' })
  @ApiOkResponse({ type: PatientProfileDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async getProfile(@CurrentUser() actor: Actor) {
    return this.profilesService.getProfile(actor.id);
  }

  @Put()
  @ApiOperation({ summary: 'Create or replace current patient profile' })
  @ApiBody({ type: PatientProfilePutDto })
  @ApiOkResponse({ type: PatientProfileDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async putProfile(
    @CurrentUser() actor: Actor,
    @Body() dto: PatientProfilePutDto,
  ) {
    return this.profilesService.upsertProfile(actor.id, dto);
  }

  @Patch()
  @ApiOperation({ summary: 'Update current patient profile' })
  @ApiBody({ type: PatientProfilePatchDto })
  @ApiOkResponse({ type: PatientProfileDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async patchProfile(
    @CurrentUser() actor: Actor,
    @Body() dto: PatientProfilePatchDto,
  ) {
    return this.profilesService.patchProfile(actor.id, dto);
  }
}
