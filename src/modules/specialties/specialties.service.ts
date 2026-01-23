import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AdminCreateSpecialtyDto } from './dto/admin-create-specialty.dto';
import { AdminUpdateSpecialtyDto } from './dto/admin-update-specialty.dto';
import { SpecialtiesQueryDto } from './dto/specialties-query.dto';

/**
 * Catálogo + soft delete de specialties
 * - Lógica de especialidades: listar activas, crear/actualizar y desactivar.
 *
 * How it works:
 * - listActive(query): devuelve specialty.findMany filtrando isActive=true,
 *   ordenado por name, con paginación por limit/offset (default 50/0).
 * - create(dto): crea specialty activa; si choca unique (P2002) -> 409.
 * - update(id, dto): arma data solo con campos presentes; si DTO vacío,
 *   devuelve existente o 404; maneja unique (P2002) -> 409.
 * - softDelete(id): setea isActive=false; si no existe (P2025) -> 404.
 */

@Injectable()
export class SpecialtiesService {
  constructor(private readonly prisma: PrismaService) {}

  async listActive(query: SpecialtiesQueryDto) {
    const take = query.limit ?? 50;
    const skip = query.offset ?? 0;

    return this.prisma.specialty.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      take,
      skip,
    });
  }

  async create(dto: AdminCreateSpecialtyDto) {
    try {
      return await this.prisma.specialty.create({
        data: {
          name: dto.name,
          isActive: true,
        },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('Specialty already exists');
      }
      throw error;
    }
  }

  async update(id: string, dto: AdminUpdateSpecialtyDto) {
    const data: { name?: string; isActive?: boolean } = {};
    if (dto.name !== undefined) {
      data.name = dto.name;
    }
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }

    if (Object.keys(data).length === 0) {
      const existing = await this.prisma.specialty.findUnique({
        where: { id },
      });
      if (!existing) {
        throw new NotFoundException('Specialty not found');
      }
      return existing;
    }

    try {
      return await this.prisma.specialty.update({
        where: { id },
        data,
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('Specialty already exists');
      }
      throw error;
    }
  }

  async softDelete(id: string) {
    try {
      await this.prisma.specialty.update({
        where: { id },
        data: { isActive: false },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Specialty not found');
      }
      throw error;
    }
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
