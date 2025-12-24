import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
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
import { AvailabilityExceptionDto } from './docs/availability-exception.dto';
import { AvailabilityRuleDto } from './docs/availability-rule.dto';
import { PublicAvailabilityResponseDto } from './docs/public-availability.dto';
import { AvailabilityExceptionCreateDto } from './dto/availability-exception-create.dto';
import { AvailabilityExceptionsQueryDto } from './dto/availability-exceptions-query.dto';
import { AvailabilityRulesPutDto } from './dto/availability-rules-put.dto';
import { PublicAvailabilityQueryDto } from './dto/public-availability-query.dto';
import { DoctorAvailabilityService } from './doctor-availability.service';

@ApiTags('doctors')
@Controller('doctors')
export class DoctorAvailabilityController {
  constructor(
    private readonly availabilityService: DoctorAvailabilityService,
  ) {}

  @Get('me/availability-rules')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.doctor)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List availability rules for current doctor' })
  @ApiOkResponse({ type: [AvailabilityRuleDto] })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async listRules(@CurrentUser() actor: Actor) {
    return this.availabilityService.listRules(actor.id);
  }

  @Put('me/availability-rules')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.doctor)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Replace availability rules for current doctor' })
  @ApiBody({ type: AvailabilityRulesPutDto })
  @ApiOkResponse({ type: [AvailabilityRuleDto] })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async replaceRules(
    @CurrentUser() actor: Actor,
    @Body() dto: AvailabilityRulesPutDto,
  ) {
    return this.availabilityService.replaceRules(actor.id, dto);
  }

  @Get('me/availability-exceptions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.doctor)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List availability exceptions for current doctor' })
  @ApiOkResponse({ type: [AvailabilityExceptionDto] })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async listExceptions(
    @CurrentUser() actor: Actor,
    @Query() query: AvailabilityExceptionsQueryDto,
  ) {
    return this.availabilityService.listExceptions(actor.id, query);
  }

  @Post('me/availability-exceptions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.doctor)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create availability exception for current doctor' })
  @ApiBody({ type: AvailabilityExceptionCreateDto })
  @ApiOkResponse({ type: AvailabilityExceptionDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async createException(
    @CurrentUser() actor: Actor,
    @Body() dto: AvailabilityExceptionCreateDto,
  ) {
    return this.availabilityService.createException(actor.id, dto);
  }

  @Delete('me/availability-exceptions/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.doctor)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete availability exception for current doctor' })
  @ApiOkResponse({ schema: { example: { success: true } } })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async deleteException(@CurrentUser() actor: Actor, @Param('id') id: string) {
    await this.availabilityService.deleteException(actor.id, id);
    return { success: true };
  }

  @Get(':doctorUserId/availability')
  @ApiOperation({ summary: 'Get public availability slots for a doctor' })
  @ApiOkResponse({ type: PublicAvailabilityResponseDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async publicAvailability(
    @Param('doctorUserId') doctorUserId: string,
    @Query() query: PublicAvailabilityQueryDto,
  ) {
    return this.availabilityService.getPublicAvailability(doctorUserId, query);
  }
}
