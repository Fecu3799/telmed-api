import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
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
import { DoctorPaymentAccountDto } from './docs/doctor-payment-account.dto';
import { UpsertDoctorPaymentAccountDto } from './dto/upsert-doctor-payment-account.dto';
import { DoctorPaymentAccountService } from './doctor-payment-account.service';

/**
 * Doctor payment account (DEV) controller.
 * What it does:
 * - Exposes connect/disconnect endpoints for the simulated account.
 */
@ApiTags('doctors')
@Controller('doctors/me')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.doctor)
@ApiBearerAuth('access-token')
export class DoctorPaymentAccountController {
  constructor(
    private readonly doctorPaymentAccountService: DoctorPaymentAccountService,
  ) {}

  @Get('payment-account')
  @ApiOperation({ summary: 'Get doctor payment account (DEV)' })
  @ApiOkResponse({ type: DoctorPaymentAccountDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async getMyAccount(@CurrentUser() actor: Actor) {
    return this.doctorPaymentAccountService.getMyAccount(actor);
  }

  @Put('payment-account')
  @ApiOperation({ summary: 'Upsert doctor payment account (DEV)' })
  @ApiOkResponse({ type: DoctorPaymentAccountDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async upsertMyAccount(
    @CurrentUser() actor: Actor,
    @Body() dto: UpsertDoctorPaymentAccountDto,
  ) {
    return this.doctorPaymentAccountService.upsertMyAccount(actor, dto);
  }

  @Post('payment-account/disconnect')
  @HttpCode(200)
  @ApiOperation({ summary: 'Disconnect doctor payment account (DEV)' })
  @ApiOkResponse({ type: DoctorPaymentAccountDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async disconnectMyAccount(@CurrentUser() actor: Actor) {
    return this.doctorPaymentAccountService.disconnectMyAccount(actor);
  }
}
