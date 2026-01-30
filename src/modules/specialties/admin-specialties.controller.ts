import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
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
import { AdminSpecialtiesListDto } from './docs/admin-specialties-list.dto';
import { SpecialtyDeleteDto } from './docs/specialty-delete.dto';
import { SpecialtyDto } from './docs/specialty.dto';
import { AdminCreateSpecialtyDto } from './dto/admin-create-specialty.dto';
import { AdminSpecialtiesQueryDto } from './dto/admin-specialties-query.dto';
import { AdminUpdateSpecialtyDto } from './dto/admin-update-specialty.dto';
import { SpecialtiesService } from './specialties.service';

/**
 * CRUD de specialties (admin only)
 * - Expone endpoints de admin para administrar el catálogo de especialidades.
 *
 * How it works:
 * - Monta bajo /admin/specialties y exige JwtAuthGuard + RolesGuard con rol admin.
 * - GET /admin/specialties -> SpecialtiesService.listAdmin(query).
 * - POST /admin/specialties -> SpecialtiesService.create(actor, dto).
 * - PATCH /admin/specialties/:id -> SpecialtiesService.update(actor, id, dto).
 * - POST /admin/specialties/:id/deactivate -> SpecialtiesService.deactivate(actor, id).
 * - POST /admin/specialties/:id/activate -> SpecialtiesService.activate(actor, id).
 * - DELETE /admin/specialties/:id -> alias for deactivate.
 */

@ApiTags('admin')
@Controller('admin/specialties')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin)
@ApiBearerAuth('access-token')
export class AdminSpecialtiesController {
  constructor(private readonly specialtiesService: SpecialtiesService) {}

  @Get()
  @ApiOperation({ summary: 'List specialties (admin)' })
  @ApiOkResponse({ type: AdminSpecialtiesListDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async list(@Query() query: AdminSpecialtiesQueryDto) {
    return this.specialtiesService.listAdmin(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create specialty' })
  @ApiBody({ type: AdminCreateSpecialtyDto })
  @ApiOkResponse({ type: SpecialtyDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async create(
    @CurrentUser() actor: Actor,
    @Body() dto: AdminCreateSpecialtyDto,
  ) {
    return this.specialtiesService.create(actor, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update specialty' })
  @ApiBody({ type: AdminUpdateSpecialtyDto })
  @ApiOkResponse({ type: SpecialtyDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async update(
    @CurrentUser() actor: Actor,
    @Param('id') id: string,
    @Body() dto: AdminUpdateSpecialtyDto,
  ) {
    return this.specialtiesService.update(actor, id, dto);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Deactivate specialty' })
  @ApiOkResponse({ type: SpecialtyDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async deactivate(@CurrentUser() actor: Actor, @Param('id') id: string) {
    return this.specialtiesService.deactivate(actor, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate specialty (legacy)' })
  @ApiOkResponse({ type: SpecialtyDeleteDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async remove(@CurrentUser() actor: Actor, @Param('id') id: string) {
    await this.specialtiesService.deactivate(actor, id);
    return { success: true };
  }

  @Post(':id/activate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Activate specialty' })
  @ApiOkResponse({ type: SpecialtyDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async activate(@CurrentUser() actor: Actor, @Param('id') id: string) {
    return this.specialtiesService.activate(actor, id);
  }
}
