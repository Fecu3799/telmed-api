import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../../infra/audit/audit.service';
import { getTraceId } from '../../common/request-context';
import type { Actor } from '../../common/types/actor.type';
import { AdminCreateSpecialtyDto } from './dto/admin-create-specialty.dto';
import { AdminSpecialtiesQueryDto } from './dto/admin-specialties-query.dto';
import { AdminUpdateSpecialtyDto } from './dto/admin-update-specialty.dto';
import { SpecialtiesQueryDto } from './dto/specialties-query.dto';

/**
 * Catálogo + soft delete de specialties
 * - Lógica de especialidades: listar activas, crear/actualizar y desactivar.
 *
 * How it works:
 * - listActive(query): devuelve specialty.findMany filtrando isActive=true,
 *   ordenado por name, con paginación por limit/offset (default 50/0).
 * - listAdmin(query): pagina + filtra por q/isActive y ordena por sortOrder+name.
 * - create(actor, dto): crea specialty; si choca unique (P2002) -> 409.
 * - update(actor, id, dto): arma data solo con campos presentes; si DTO vacío,
 *   devuelve existente o 404; maneja unique (P2002) -> 409.
 * - deactivate(actor, id): setea isActive=false; si no existe (P2025) -> 404.
 * - activate(actor, id): setea isActive=true; si no existe (P2025) -> 404.
 */

@Injectable()
export class SpecialtiesService {
  private readonly logger = new Logger(SpecialtiesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listActive(query: SpecialtiesQueryDto) {
    const take = query.limit ?? 50;
    const skip = query.offset ?? 0;

    return this.prisma.specialty.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        sortOrder: true,
        isActive: true,
      },
      take,
      skip,
    });
  }

  async listAdmin(query: AdminSpecialtiesQueryDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 50);
    const skip = (page - 1) * pageSize;

    const where: Prisma.SpecialtyWhereInput = {};
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { slug: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.specialty.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        take: pageSize,
        skip,
      }),
      this.prisma.specialty.count({ where }),
    ]);

    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);

    return {
      items,
      pageInfo: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasNextPage: totalPages > 0 ? page < totalPages : false,
        hasPrevPage: page > 1,
      },
    };
  }

  async create(actor: Actor, dto: AdminCreateSpecialtyDto) {
    try {
      const specialty = await this.prisma.specialty.create({
        data: {
          name: dto.name,
          slug: dto.slug,
          sortOrder: dto.sortOrder ?? 0,
          isActive: dto.isActive ?? true,
          deactivatedAt: dto.isActive === false ? new Date() : null,
        },
      });
      await this.auditService.log({
        action: AuditAction.WRITE,
        resourceType: 'Specialty',
        resourceId: specialty.id,
        actor,
        traceId: getTraceId() ?? null,
      });
      this.logWrite('create', actor, specialty.id);
      return specialty;
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        this.throwConflict();
      }
      throw error;
    }
  }

  async update(actor: Actor, id: string, dto: AdminUpdateSpecialtyDto) {
    const data: {
      name?: string;
      slug?: string;
      sortOrder?: number;
      isActive?: boolean;
      deactivatedAt?: Date | null;
    } = {};
    if (dto.name !== undefined) {
      data.name = dto.name;
    }
    if (dto.slug !== undefined) {
      data.slug = dto.slug;
    }
    if (dto.sortOrder !== undefined) {
      data.sortOrder = dto.sortOrder;
    }
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
      data.deactivatedAt = dto.isActive ? null : new Date();
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
      const specialty = await this.prisma.specialty.update({
        where: { id },
        data,
      });
      await this.auditService.log({
        action: AuditAction.WRITE,
        resourceType: 'Specialty',
        resourceId: specialty.id,
        actor,
        traceId: getTraceId() ?? null,
      });
      this.logWrite('update', actor, specialty.id);
      return specialty;
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        this.throwConflict();
      }
      throw error;
    }
  }

  async deactivate(actor: Actor, id: string) {
    try {
      const specialty = await this.prisma.specialty.update({
        where: { id },
        data: { isActive: false, deactivatedAt: new Date() },
      });
      await this.auditService.log({
        action: AuditAction.WRITE,
        resourceType: 'Specialty',
        resourceId: specialty.id,
        actor,
        traceId: getTraceId() ?? null,
      });
      this.logWrite('deactivate', actor, specialty.id);
      return specialty;
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

  async activate(actor: Actor, id: string) {
    try {
      const specialty = await this.prisma.specialty.update({
        where: { id },
        data: { isActive: true, deactivatedAt: null },
      });
      await this.auditService.log({
        action: AuditAction.WRITE,
        resourceType: 'Specialty',
        resourceId: specialty.id,
        actor,
        traceId: getTraceId() ?? null,
      });
      this.logWrite('activate', actor, specialty.id);
      return specialty;
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

  private logWrite(action: string, actor: Actor, specialtyId: string) {
    this.logger.log('admin_specialty_write', {
      action,
      specialtyId,
      actorId: actor.id,
      traceId: getTraceId() ?? null,
    });
  }

  private throwConflict(): never {
    throw new ConflictException({
      type: 'https://telmed/errors/specialty-conflict',
      title: 'Specialty conflict',
      detail: 'Specialty already exists',
      status: 409,
      extensions: { code: 'specialty_conflict' },
    });
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
