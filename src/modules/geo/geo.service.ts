import {
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ConsultationQueueStatus, Prisma } from '@prisma/client';
import type { Actor } from '../../common/types/actor.type';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { ConsultationQueueService } from '../consultation-queue/consultation-queue.service';
import { GeoEmergencyCreateDto } from './dto/geo-emergency-create.dto';
import { GeoNearbyQueryDto } from './dto/geo-nearby-query.dto';
import { SubscriptionPlanResolver } from './subscription-plan-resolver.service';
import { GeoEmergencyCoordinator } from './geo-emergency-coordinator.service';
import { CLOCK, type Clock } from '../../common/clock/clock';

const ONLINE_GEO_KEY = 'geo:doctors:online';
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const PRESENCE_TTL_SECONDS = 60;

@Injectable()
export class GeoService {
  private readonly groupTtlSeconds = 15 * 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly queueService: ConsultationQueueService,
    private readonly planResolver: SubscriptionPlanResolver,
    private readonly coordinator: GeoEmergencyCoordinator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async goOnline(actor: Actor) {
    const location = await this.getDoctorLocation(actor.id);
    if (!location) {
      throw new UnprocessableEntityException('Doctor location not configured');
    }

    const client = this.redis.getClient();
    await client.geoadd(ONLINE_GEO_KEY, location.lng, location.lat, actor.id);
    await client.set(
      this.doctorOnlineKey(actor.id),
      '1',
      'EX',
      PRESENCE_TTL_SECONDS,
    );

    return { status: 'online' as const, ttlSeconds: PRESENCE_TTL_SECONDS };
  }

  async ping(actor: Actor) {
    const client = this.redis.getClient();
    const ttlKey = this.doctorOnlineKey(actor.id);
    const exists = await client.exists(ttlKey);
    if (!exists) {
      throw new ConflictException('Doctor is offline');
    }

    await client.expire(ttlKey, PRESENCE_TTL_SECONDS);
    return { status: 'online' as const, ttlSeconds: PRESENCE_TTL_SECONDS };
  }

  async goOffline(actor: Actor) {
    const client = this.redis.getClient();
    await client.del(this.doctorOnlineKey(actor.id));
    await client.zrem(ONLINE_GEO_KEY, actor.id);
    return { success: true };
  }

  async nearbyDoctors(actor: Actor, query: GeoNearbyQueryDto) {
    const { page, pageSize, offset, count } = this.resolvePaging(
      query.page,
      query.pageSize,
    );

    const maxRadiusMeters = this.resolveMaxRadiusMeters(actor.id);
    if (query.radiusMeters > maxRadiusMeters) {
      throw new UnprocessableEntityException('radiusMeters exceeds plan limit');
    }

    const client = this.redis.getClient();
    const raw = (await client.call(
      'GEOSEARCH',
      ONLINE_GEO_KEY,
      'FROMLONLAT',
      String(query.lng),
      String(query.lat),
      'BYRADIUS',
      String(query.radiusMeters),
      'm',
      'WITHDIST',
      'COUNT',
      String(count),
      'ASC',
    )) as unknown[];

    const pairs = this.parseGeoPairs(raw);
    if (pairs.length === 0) {
      return this.buildNearbyResponse([], page, pageSize, false);
    }

    const onlinePairs = await this.filterOnlinePairs(pairs);
    if (onlinePairs.length === 0) {
      return this.buildNearbyResponse([], page, pageSize, false);
    }

    const filteredProfiles = await this.fetchDoctorProfiles(
      onlinePairs.map((pair) => pair.doctorId),
      query.specialtyId,
      query.maxPriceCents,
    );

    const profileMap = new Map(
      filteredProfiles.map((profile) => [profile.userId, profile]),
    );

    const specialtiesByDoctor = await this.fetchSpecialties(
      filteredProfiles.map((profile) => profile.userId),
    );

    const filtered = onlinePairs
      .filter((pair) => profileMap.has(pair.doctorId))
      .map((pair) => {
        const profile = profileMap.get(pair.doctorId)!;
        return {
          doctorUserId: profile.userId,
          displayName: profile.user.displayName,
          firstName: profile.firstName,
          lastName: profile.lastName,
          priceCents: profile.priceCents,
          currency: profile.currency,
          verificationStatus: profile.verificationStatus,
          distanceMeters: pair.distanceMeters,
          specialties: specialtiesByDoctor.get(profile.userId) ?? [],
        };
      });

    const items = filtered.slice(offset, offset + pageSize);
    const hasNextPage = filtered.length > offset + pageSize;
    return this.buildNearbyResponse(items, page, pageSize, hasNextPage);
  }

  async createEmergency(actor: Actor, dto: GeoEmergencyCreateDto) {
    const uniqueIds = Array.from(new Set(dto.doctorIds));
    const maxDoctors = this.resolveMaxDoctors(actor.id);
    if (uniqueIds.length !== dto.doctorIds.length) {
      throw new UnprocessableEntityException('doctorIds must be unique');
    }
    if (uniqueIds.length > maxDoctors) {
      throw new UnprocessableEntityException('doctorIds exceeds plan limit');
    }

    await this.assertQuota(actor.id);

    const doctorProfiles = await this.prisma.doctorProfile.findMany({
      where: {
        userId: { in: uniqueIds },
        isActive: true,
        user: { role: 'doctor', status: 'active' },
      },
      select: { userId: true },
    });
    if (doctorProfiles.length !== uniqueIds.length) {
      throw new NotFoundException('Doctor not found');
    }

    const existingQueue = await this.prisma.consultationQueueItem.findFirst({
      where: {
        doctorUserId: { in: uniqueIds },
        patientUserId: actor.id,
        appointmentId: null,
        status: {
          in: [
            ConsultationQueueStatus.queued,
            ConsultationQueueStatus.accepted,
          ],
        },
        closedAt: null,
      },
      select: { id: true },
    });
    if (existingQueue) {
      throw new ConflictException('Queue already exists');
    }

    const reason = dto.note ?? 'Geo emergency request';
    const requests: { doctorId: string; queueItemId: string }[] = [];

    for (const doctorUserId of uniqueIds) {
      const queueItem = await this.queueService.createQueue(actor, {
        doctorUserId,
        patientUserId: actor.id,
        reason,
      });
      requests.push({ doctorId: doctorUserId, queueItemId: queueItem.id });
    }

    const groupId = randomUUID();
    await this.persistGroup(groupId, actor.id, dto, requests);

    return { groupId, requests };
  }

  private async persistGroup(
    groupId: string,
    patientId: string,
    dto: GeoEmergencyCreateDto,
    requests: { doctorId: string; queueItemId: string }[],
  ) {
    const payload = {
      patientId,
      doctorIds: requests.map((request) => request.doctorId),
      queueItemIds: requests.map((request) => request.queueItemId),
      status: 'pending',
      createdAt: this.clock.now().toISOString(),
      patientLocation: dto.patientLocation,
      note: dto.note ?? null,
    };

    const client = this.redis.getClient();
    const groupKey = this.coordinator.groupKey(groupId);

    // Group metadata for coordinating acceptance and sibling cancellation.
    await client.set(
      groupKey,
      JSON.stringify(payload),
      'EX',
      this.groupTtlSeconds,
    );

    const pipeline = client.pipeline();
    for (const request of requests) {
      pipeline.set(
        this.coordinator.requestMappingKey(request.queueItemId),
        groupId,
        'EX',
        this.groupTtlSeconds,
      );
    }
    await pipeline.exec();
  }

  private async assertQuota(patientId: string) {
    const client = this.redis.getClient();
    const dailyLimit = Number(process.env.GEO_EMERGENCY_DAILY_LIMIT ?? 5);
    const monthlyLimit = Number(process.env.GEO_EMERGENCY_MONTHLY_LIMIT ?? 30);

    const { dayKey, dayTtlSeconds, monthKey, monthTtlSeconds } =
      this.buildQuotaKeys(patientId);

    const dailyCount = await client.incr(dayKey);
    if (dailyCount === 1) {
      await client.expire(dayKey, dayTtlSeconds);
    }

    const monthlyCount = await client.incr(monthKey);
    if (monthlyCount === 1) {
      await client.expire(monthKey, monthTtlSeconds);
    }

    if (dailyCount > dailyLimit || monthlyCount > monthlyLimit) {
      throw new HttpException('Quota exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private buildQuotaKeys(patientId: string) {
    const now = this.clock.now();
    const date = this.formatDateUTC(now);
    const month = this.formatMonthUTC(now);
    const dayKey = `geo:quota:patient:${patientId}:day:${date}`;
    const monthKey = `geo:quota:patient:${patientId}:month:${month}`;

    const nextDay = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
    );
    const nextMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );

    const dayTtlSeconds = Math.ceil((nextDay.getTime() - now.getTime()) / 1000);
    const monthTtlSeconds = Math.ceil(
      (nextMonth.getTime() - now.getTime()) / 1000,
    );

    return { dayKey, monthKey, dayTtlSeconds, monthTtlSeconds };
  }

  private formatDateUTC(date: Date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  private formatMonthUTC(date: Date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${year}${month}`;
  }

  private resolveMaxRadiusMeters(patientUserId: string) {
    const plan = this.planResolver.resolvePlan(patientUserId);
    return plan === 'PREMIUM' ? 2_000_000 : 10_000;
  }

  private resolveMaxDoctors(patientUserId: string) {
    const plan = this.planResolver.resolvePlan(patientUserId);
    return plan === 'PREMIUM' ? 3 : 3;
  }

  private resolvePaging(page?: number, pageSize?: number) {
    const resolvedPage = page ?? 1;
    const resolvedPageSize = Math.min(
      pageSize ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    );
    const offset = (resolvedPage - 1) * resolvedPageSize;
    const count = offset + resolvedPageSize + 1;
    return { page: resolvedPage, pageSize: resolvedPageSize, offset, count };
  }

  private buildNearbyResponse(
    items: Array<{
      doctorUserId: string;
      displayName: string | null;
      firstName: string | null;
      lastName: string | null;
      priceCents: number;
      currency: string;
      verificationStatus: string;
      distanceMeters: number;
      specialties: Array<{ id: string; name: string }>;
    }>,
    page: number,
    pageSize: number,
    hasNextPage: boolean,
  ) {
    return {
      items,
      pageInfo: {
        page,
        pageSize,
        hasNextPage,
        hasPrevPage: page > 1,
      },
    };
  }

  private async fetchDoctorProfiles(
    doctorIds: string[],
    specialtyId?: string,
    maxPriceCents?: number,
  ) {
    const where: Prisma.DoctorProfileWhereInput = {
      userId: { in: doctorIds },
      isActive: true,
      user: { role: 'doctor', status: 'active' },
      ...(maxPriceCents !== undefined
        ? { priceCents: { lte: maxPriceCents } }
        : {}),
      ...(specialtyId
        ? {
            specialties: {
              some: {
                specialtyId,
                specialty: { isActive: true },
              },
            },
          }
        : {}),
    };

    return this.prisma.doctorProfile.findMany({
      where,
      select: {
        userId: true,
        firstName: true,
        lastName: true,
        priceCents: true,
        currency: true,
        verificationStatus: true,
        user: { select: { displayName: true } },
      },
    });
  }

  private async fetchSpecialties(doctorIds: string[]) {
    if (doctorIds.length === 0) {
      return new Map<string, { id: string; name: string }[]>();
    }
    const items = await this.prisma.doctorSpecialty.findMany({
      where: {
        doctorUserId: { in: doctorIds },
        specialty: { isActive: true },
      },
      include: { specialty: true },
    });

    const map = new Map<string, { id: string; name: string }[]>();
    for (const item of items) {
      const list = map.get(item.doctorUserId) ?? [];
      list.push({ id: item.specialty.id, name: item.specialty.name });
      map.set(item.doctorUserId, list);
    }
    return map;
  }

  private async getDoctorLocation(userId: string) {
    const rows = await this.prisma.$queryRaw<
      { lat: number | null; lng: number | null }[]
    >(Prisma.sql`
      SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
      FROM doctor_profiles
      WHERE user_id = ${userId}
    `);

    if (rows.length === 0) {
      return null;
    }
    const { lat, lng } = rows[0];
    if (lat === null || lng === null) {
      return null;
    }
    return { lat, lng };
  }

  private doctorOnlineKey(doctorUserId: string) {
    return `geo:doctor:${doctorUserId}:online`;
  }

  private parseGeoPairs(raw: unknown[]) {
    if (!Array.isArray(raw)) {
      return [];
    }
    const pairs: { doctorId: string; distanceMeters: number }[] = [];
    for (const entry of raw) {
      if (!Array.isArray(entry) || entry.length < 2) {
        continue;
      }
      const [doctorId, distance] = entry as [string, string];
      const distanceMeters = Number(distance);
      if (!doctorId || Number.isNaN(distanceMeters)) {
        continue;
      }
      pairs.push({ doctorId, distanceMeters });
    }
    return pairs;
  }

  private async filterOnlinePairs(
    pairs: Array<{ doctorId: string; distanceMeters: number }>,
  ) {
    const client = this.redis.getClient();
    const ttlKeys = pairs.map((pair) => this.doctorOnlineKey(pair.doctorId));
    const ttlValues = await client.mget(ttlKeys);

    const offlineIds: string[] = [];
    const onlinePairs: Array<{ doctorId: string; distanceMeters: number }> = [];
    for (let index = 0; index < pairs.length; index += 1) {
      const pair = pairs[index];
      const ttlValue = ttlValues[index];
      if (ttlValue) {
        onlinePairs.push(pair);
      } else {
        offlineIds.push(pair.doctorId);
      }
    }

    if (offlineIds.length > 0) {
      // Lazy cleanup: drop stale entries from geo index.
      await client.zrem(ONLINE_GEO_KEY, ...offlineIds);
    }

    return onlinePairs;
  }
}
