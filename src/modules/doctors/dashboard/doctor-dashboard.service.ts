import { Inject, Injectable } from '@nestjs/common';
import { PaymentStatus, type Prisma } from '@prisma/client';
import { CLOCK, type Clock } from '../../../common/clock/clock';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import type { Actor } from '../../../common/types/actor.type';
import { DoctorPaymentsQueryDto } from './dto/doctor-payments-query.dto';
import { DoctorPaymentsResponseDto } from './docs/doctor-payments.dto';
import { DoctorDashboardOverviewDto } from './docs/doctor-dashboard-overview.dto';
import { resolveDashboardRange } from './range-utils';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

/**
 * Doctor dashboard service.
 * What it does:
 * - Aggregates paid payment KPIs and lists payments for the authenticated doctor.
 * How it works:
 * - Uses updatedAt as a paidAt surrogate because Payment has no paidAt column.
 * Gotchas:
 * - Range filtering uses updatedAt for paid status and createdAt for other statuses.
 */
@Injectable()
export class DoctorDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private resolvePaging(page?: number, pageSize?: number) {
    const resolvedPage = page ?? 1;
    const resolvedPageSize = Math.min(
      pageSize ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    );
    const skip = (resolvedPage - 1) * resolvedPageSize;
    return { page: resolvedPage, pageSize: resolvedPageSize, skip };
  }

  async getOverview(
    actor: Actor,
    range?: string,
  ): Promise<DoctorDashboardOverviewDto> {
    const {
      range: resolvedRange,
      from,
      to,
    } = resolveDashboardRange(range, this.clock.now());

    const where: Prisma.PaymentWhereInput = {
      doctorUserId: actor.id,
      status: PaymentStatus.paid,
      // No paidAt column yet; updatedAt is the best proxy for paid date.
      updatedAt: {
        gte: from,
        lte: to,
      },
    };

    const [aggregate, distinctPatients] = await this.prisma.$transaction([
      this.prisma.payment.aggregate({
        where,
        _sum: {
          grossAmountCents: true,
          platformFeeCents: true,
          totalChargedCents: true,
        },
        _count: { _all: true },
      }),
      this.prisma.payment.findMany({
        where,
        distinct: ['patientUserId'],
        select: { patientUserId: true },
      }),
    ]);

    return {
      range: resolvedRange,
      currency: 'ARS',
      kpis: {
        grossEarningsCents: aggregate._sum.grossAmountCents ?? 0,
        platformFeesCents: aggregate._sum.platformFeeCents ?? 0,
        totalChargedCents: aggregate._sum.totalChargedCents ?? 0,
        paidPaymentsCount: aggregate._count._all ?? 0,
        uniquePatientsCount: distinctPatients.length,
      },
    };
  }

  async listPayments(
    actor: Actor,
    query: DoctorPaymentsQueryDto,
  ): Promise<DoctorPaymentsResponseDto> {
    const { page, pageSize, skip } = this.resolvePaging(
      query.page,
      query.pageSize,
    );
    const { from, to } = resolveDashboardRange(query.range, this.clock.now());
    const status = query.status;

    const rangeFilter:
      | Pick<Prisma.PaymentWhereInput, 'createdAt'>
      | Pick<Prisma.PaymentWhereInput, 'updatedAt'> =
      status === PaymentStatus.paid
        ? {
            // Paid range uses updatedAt as a paidAt surrogate.
            updatedAt: { gte: from, lte: to },
          }
        : {
            // For non-paid (or mixed) status, use creation date to keep semantics stable.
            createdAt: { gte: from, lte: to },
          };

    const where: Prisma.PaymentWhereInput = {
      doctorUserId: actor.id,
      ...(status ? { status } : {}),
      ...rangeFilter,
    };

    const orderBy:
      | Prisma.PaymentOrderByWithRelationInput
      | Prisma.PaymentOrderByWithRelationInput[] =
      status === PaymentStatus.paid
        ? { updatedAt: 'desc' }
        : { createdAt: 'desc' };

    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        select: {
          id: true,
          status: true,
          grossAmountCents: true,
          platformFeeCents: true,
          totalChargedCents: true,
          currency: true,
          createdAt: true,
          updatedAt: true,
          kind: true,
          appointmentId: true,
          queueItemId: true,
          patient: {
            select: {
              id: true,
              displayName: true,
            },
          },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);

    return {
      items: items.map((item) => ({
        id: item.id,
        status: item.status,
        grossAmountCents: item.grossAmountCents,
        platformFeeCents: item.platformFeeCents,
        totalChargedCents: item.totalChargedCents,
        currency: item.currency,
        createdAt: item.createdAt.toISOString(),
        paidAt:
          item.status === PaymentStatus.paid
            ? item.updatedAt.toISOString()
            : null,
        kind: item.kind,
        appointmentId: item.appointmentId ?? null,
        queueItemId: item.queueItemId ?? null,
        patient: item.patient
          ? { id: item.patient.id, displayName: item.patient.displayName }
          : null,
      })),
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
}
