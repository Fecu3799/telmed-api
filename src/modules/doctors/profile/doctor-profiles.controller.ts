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
import { ProblemDetailsDto } from '../../../common/docs/problem-details.dto';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import type { Actor } from '../../../common/types/actor.type';
import { DoctorProfileDto } from './docs/doctor-profile.dto';
import { DoctorSpecialtiesResponseDto } from './docs/doctor-specialty.dto';
import { DoctorProfilePatchDto } from './dto/doctor-profile-patch.dto';
import { DoctorProfilePutDto } from './dto/doctor-profile-put.dto';
import { DoctorSpecialtiesPutDto } from './dto/doctor-specialties-put.dto';
import { LocationDto } from './dto/location.dto';
import { DoctorProfilesService } from './doctor-profiles.service';

@ApiTags('doctors')
@Controller('doctors/me')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.doctor)
@ApiBearerAuth('access-token')
export class DoctorProfilesController {
  constructor(private readonly profilesService: DoctorProfilesService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Get current doctor profile' })
  @ApiOkResponse({ type: DoctorProfileDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async getProfile(@CurrentUser() actor: Actor) {
    return this.profilesService.getProfile(actor.id);
  }

  @Put('profile')
  @ApiOperation({ summary: 'Create or replace current doctor profile' })
  @ApiBody({ type: DoctorProfilePutDto })
  @ApiOkResponse({ type: DoctorProfileDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async putProfile(
    @CurrentUser() actor: Actor,
    @Body() dto: DoctorProfilePutDto,
  ) {
    return this.profilesService.upsertProfile(actor.id, dto);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update current doctor profile' })
  @ApiBody({ type: DoctorProfilePatchDto })
  @ApiOkResponse({ type: DoctorProfileDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async patchProfile(
    @CurrentUser() actor: Actor,
    @Body() dto: DoctorProfilePatchDto,
  ) {
    return this.profilesService.patchProfile(actor.id, dto);
  }

  @Put('location')
  @ApiOperation({ summary: 'Update current doctor location' })
  @ApiBody({ type: LocationDto })
  @ApiOkResponse({ type: DoctorProfileDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async putLocation(@CurrentUser() actor: Actor, @Body() dto: LocationDto) {
    return this.profilesService.updateLocation(actor.id, dto);
  }

  @Get('specialties')
  @ApiOperation({ summary: 'List current doctor specialties' })
  @ApiOkResponse({ type: DoctorSpecialtiesResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async getSpecialties(@CurrentUser() actor: Actor) {
    return this.profilesService.getSpecialties(actor.id);
  }

  @Put('specialties')
  @ApiOperation({ summary: 'Replace current doctor specialties' })
  @ApiBody({ type: DoctorSpecialtiesPutDto })
  @ApiOkResponse({ type: DoctorSpecialtiesResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async putSpecialties(
    @CurrentUser() actor: Actor,
    @Body() dto: DoctorSpecialtiesPutDto,
  ) {
    return this.profilesService.setSpecialties(actor.id, dto);
  }
}
