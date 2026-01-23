import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ProblemDetailsDto } from '../../common/docs/problem-details.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SpecialtyDeleteDto } from './docs/specialty-delete.dto';
import { SpecialtyDto } from './docs/specialty.dto';
import { AdminCreateSpecialtyDto } from './dto/admin-create-specialty.dto';
import { AdminUpdateSpecialtyDto } from './dto/admin-update-specialty.dto';
import { SpecialtiesService } from './specialties.service';

/**
 * CRUD de specialties (admin only)
 * - Expone endpoints de admin para administrar el catálogo de especialidades.
 *
 * How it works:
 * - Monta bajo /admin/specialties y exige JwtAuthGuard + RolesGuard con rol admin.
 * - POST /admin/specialties -> SpecialtiesService.create(dto).
 * - PATCH /admin/specialties/:id -> SpecialtiesService.update(id, dto).
 * - DELETE /admin/specialties/:id -> SpecialtiesService.softDelete(id).
 */

@ApiTags('admin')
@Controller('admin/specialties')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin)
@ApiBearerAuth('access-token')
export class AdminSpecialtiesController {
  constructor(private readonly specialtiesService: SpecialtiesService) {}

  @Post()
  @ApiOperation({ summary: 'Create specialty' })
  @ApiBody({ type: AdminCreateSpecialtyDto })
  @ApiOkResponse({ type: SpecialtyDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async create(@Body() dto: AdminCreateSpecialtyDto) {
    return this.specialtiesService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update specialty' })
  @ApiBody({ type: AdminUpdateSpecialtyDto })
  @ApiOkResponse({ type: SpecialtyDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async update(@Param('id') id: string, @Body() dto: AdminUpdateSpecialtyDto) {
    return this.specialtiesService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete specialty' })
  @ApiOkResponse({ type: SpecialtyDeleteDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async remove(@Param('id') id: string) {
    await this.specialtiesService.softDelete(id);
    return { success: true };
  }
}
