import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ProblemDetailsDto } from '../../common/docs/problem-details.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { Actor } from '../../common/types/actor.type';
import { GeoService } from './geo.service';
import { GeoEmergencyCreateDto } from './dto/geo-emergency-create.dto';
import { GeoEmergencyResponseDto } from './dto/geo-emergency-response.dto';
import { GeoNearbyQueryDto } from './dto/geo-nearby-query.dto';
import { GeoNearbyResponseDto } from './dto/geo-nearby-response.dto';
import {
  GeoPresenceOfflineResponseDto,
  GeoPresenceResponseDto,
} from './dto/geo-presence-response.dto';

@ApiTags('geo')
@Controller()
export class GeoController {
  constructor(private readonly geoService: GeoService) {}

  @Post('doctors/me/geo/online')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.doctor)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Set doctor online for geo emergencies' })
  @ApiOkResponse({ type: GeoPresenceResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  online(@CurrentUser() actor: Actor) {
    return this.geoService.goOnline(actor);
  }

  @Post('doctors/me/geo/ping')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.doctor)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Refresh doctor online TTL' })
  @ApiOkResponse({ type: GeoPresenceResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  ping(@CurrentUser() actor: Actor) {
    return this.geoService.ping(actor);
  }

  @Post('doctors/me/geo/offline')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.doctor)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Set doctor offline for geo emergencies' })
  @ApiOkResponse({ type: GeoPresenceOfflineResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  offline(@CurrentUser() actor: Actor) {
    return this.geoService.goOffline(actor);
  }

  @Get('geo/doctors/nearby')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.patient)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List nearby doctors for geo emergencies' })
  @ApiOkResponse({ type: GeoNearbyResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  nearby(@CurrentUser() actor: Actor, @Query() query: GeoNearbyQueryDto) {
    return this.geoService.nearbyDoctors(actor, query);
  }

  @Post('geo/emergencies')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.patient)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create geo emergency requests' })
  @ApiBody({ type: GeoEmergencyCreateDto })
  @ApiCreatedResponse({ type: GeoEmergencyResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  createEmergency(
    @CurrentUser() actor: Actor,
    @Body() dto: GeoEmergencyCreateDto,
  ) {
    return this.geoService.createEmergency(actor, dto);
  }
}
