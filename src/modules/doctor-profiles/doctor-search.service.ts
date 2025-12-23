import {
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { decodeCursor, encodeCursor } from '../../common/utils/cursor';
import { DoctorSearchQueryDto } from './dto/doctor-search-query.dto';

type SearchSort =
  | 'relevance'
  | 'distance'
  | 'price_asc'
  | 'price_desc'
  | 'name_asc'
  | 'name_desc';

type SearchCursor =
  | { sort: 'distance'; lastDistance: number; lastId: string }
  | { sort: 'price_asc' | 'price_desc'; lastPrice: number; lastId: string }
  | { sort: 'name_asc' | 'name_desc'; lastName: string; lastId: string }
  | {
      sort: 'relevance';
      lastRank: number;
      lastName: string;
      lastId: string;
    };

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

@Injectable()
export class DoctorSearchService {
  private readonly logger = new Logger(DoctorSearchService.name);

  constructor(private readonly prisma: PrismaService) {}

  async search(query: DoctorSearchQueryDto, traceId?: string) {
    const hasLat = query.lat !== undefined;
    const hasLng = query.lng !== undefined;
    const hasRadius = query.radiusKm !== undefined;
    const hasGeo = hasLat || hasLng || hasRadius;
    if (hasGeo && (!hasLat || !hasLng || !hasRadius)) {
      throw new UnprocessableEntityException(
        'lat, lng, and radiusKm are required together',
      );
    }

    const trimmedQ = query.q?.trim();
    if (trimmedQ && trimmedQ.length < 2) {
      throw new UnprocessableEntityException('q must be at least 2 characters');
    }

    const like = trimmedQ ? `%${trimmedQ}%` : null;
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const sort =
      query.sort ?? (hasGeo ? 'distance' : like ? 'relevance' : 'name_asc');

    if (sort === 'distance' && !hasGeo) {
      throw new UnprocessableEntityException(
        'distance sort requires lat, lng, and radiusKm',
      );
    }

    if (sort === 'relevance' && !like) {
      throw new UnprocessableEntityException('relevance sort requires q');
    }

    const cursor = query.cursor ? this.decodeCursor(query.cursor, sort) : null;

    const conditions: Prisma.Sql[] = [
      Prisma.sql`u.role = 'doctor'`,
      Prisma.sql`u.status = 'active'`,
      Prisma.sql`dp.is_active = true`,
    ];

    if (query.maxPriceCents !== undefined) {
      conditions.push(Prisma.sql`dp.price_cents <= ${query.maxPriceCents}`);
    }

    if (like) {
      conditions.push(
        Prisma.sql`(
          u.display_name ILIKE ${like}
          OR concat_ws(' ', dp.first_name, dp.last_name) ILIKE ${like}
        )`,
      );
    }

    if (query.specialtyId) {
      conditions.push(
        Prisma.sql`EXISTS (
          SELECT 1
          FROM doctor_specialties ds
          JOIN specialties s ON s.id = ds.specialty_id
          WHERE ds.doctor_user_id = dp.user_id
            AND ds.specialty_id = ${query.specialtyId}
            AND s.is_active = true
        )`,
      );
    }

    if (query.verificationStatus) {
      conditions.push(
        Prisma.sql`dp.verification_status = ${query.verificationStatus}`,
      );
    }

    const distanceExpr = hasGeo
      ? Prisma.sql`ST_Distance(
          dp.location,
          ST_SetSRID(ST_MakePoint(${query.lng}, ${query.lat}), 4326)::geography
        )`
      : Prisma.sql`NULL::double precision`;

    if (hasGeo) {
      const radiusMeters = (query.radiusKm ?? 0) * 1000;
      conditions.push(Prisma.sql`dp.location IS NOT NULL`);
      conditions.push(
        Prisma.sql`ST_DWithin(
          dp.location,
          ST_SetSRID(ST_MakePoint(${query.lng}, ${query.lat}), 4326)::geography,
          ${radiusMeters}
        )`,
      );
    }

    const matchRankExpr = like
      ? Prisma.sql`CASE
          WHEN u.display_name IS NOT NULL AND u.display_name ILIKE ${like} THEN 0
          WHEN concat_ws(' ', dp.first_name, dp.last_name) ILIKE ${like} THEN 1
          ELSE 2
        END`
      : Prisma.sql`2`;

    const sortNameExpr = Prisma.sql`COALESCE(u.display_name, concat_ws(' ', dp.first_name, dp.last_name))`;

    let orderBy = Prisma.sql`dp.user_id ASC`;
    if (sort === 'distance') {
      orderBy = Prisma.sql`distance_meters ASC, dp.user_id ASC`;
    } else if (sort === 'price_asc') {
      orderBy = Prisma.sql`dp.price_cents ASC, dp.user_id ASC`;
    } else if (sort === 'price_desc') {
      orderBy = Prisma.sql`dp.price_cents DESC, dp.user_id ASC`;
    } else if (sort === 'name_asc') {
      orderBy = Prisma.sql`${sortNameExpr} ASC, dp.user_id ASC`;
    } else if (sort === 'name_desc') {
      orderBy = Prisma.sql`${sortNameExpr} DESC, dp.user_id ASC`;
    } else if (sort === 'relevance') {
      orderBy = Prisma.sql`
        ${matchRankExpr} ASC,
        ${sortNameExpr} ASC,
        dp.user_id ASC
      `;
    }

    if (cursor) {
      conditions.push(
        this.buildCursorCondition(
          sort,
          cursor,
          distanceExpr,
          matchRankExpr,
          sortNameExpr,
        ),
      );
    }

    if (this.isDebugEnabled()) {
      this.logger.debug(
        JSON.stringify({
          traceId,
          filters: {
            q: trimmedQ ?? null,
            specialtyId: query.specialtyId ?? null,
            maxPriceCents: query.maxPriceCents ?? null,
            verificationStatus: query.verificationStatus ?? null,
            geo: hasGeo
              ? { lat: query.lat, lng: query.lng, radiusKm: query.radiusKm }
              : null,
          },
          sort,
          limit,
          hasCursor: Boolean(cursor),
        }),
      );
    }

    const whereSql = Prisma.sql`${Prisma.join(conditions, ' AND ')}`;
    const limitPlusOne = limit + 1;

    const rows = await this.prisma.$queryRaw<
      {
        doctor_user_id: string;
        display_name: string | null;
        first_name: string | null;
        last_name: string | null;
        price_cents: number;
        currency: string;
        verification_status: string;
        lat: number | null;
        lng: number | null;
        distance_meters: number | null;
        match_rank: number;
        sort_name: string;
      }[]
    >(Prisma.sql`
      SELECT
        dp.user_id AS doctor_user_id,
        u.display_name,
        dp.first_name,
        dp.last_name,
        dp.price_cents,
        dp.currency,
        dp.verification_status,
        ST_Y(dp.location::geometry) AS lat,
        ST_X(dp.location::geometry) AS lng,
        ${distanceExpr} AS distance_meters,
        ${matchRankExpr} AS match_rank,
        ${sortNameExpr} AS sort_name
      FROM doctor_profiles dp
      JOIN users u ON u.id = dp.user_id
      WHERE ${whereSql}
      ORDER BY ${orderBy}
      LIMIT ${limitPlusOne}
    `);

    const hasNext = rows.length > limit;
    const sliced = hasNext ? rows.slice(0, limit) : rows;
    const nextCursor = hasNext
      ? encodeCursor(this.buildNextCursor(sort, sliced[sliced.length - 1]))
      : null;

    const doctorIds = sliced.map((row) => row.doctor_user_id);
    const specialties = await this.prisma.doctorSpecialty.findMany({
      where: {
        doctorUserId: { in: doctorIds },
        specialty: { isActive: true },
      },
      include: { specialty: true },
    });

    const specialtiesByDoctor = new Map<
      string,
      { id: string; name: string }[]
    >();
    for (const item of specialties) {
      const list = specialtiesByDoctor.get(item.doctorUserId) ?? [];
      list.push({ id: item.specialty.id, name: item.specialty.name });
      specialtiesByDoctor.set(item.doctorUserId, list);
    }

    const items = sliced.map((row) => ({
      doctorUserId: row.doctor_user_id,
      displayName: row.display_name,
      firstName: row.first_name,
      lastName: row.last_name,
      priceCents: row.price_cents,
      currency: row.currency,
      verificationStatus: row.verification_status,
      location:
        row.lat !== null && row.lng !== null
          ? { lat: row.lat, lng: row.lng }
          : null,
      distanceMeters: row.distance_meters,
      specialties: specialtiesByDoctor.get(row.doctor_user_id) ?? [],
    }));

    return { items, limit, pageInfo: { nextCursor } };
  }

  private decodeCursor(cursor: string, sort: SearchSort): SearchCursor {
    try {
      const parsed = decodeCursor<Record<string, unknown>>(cursor);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid cursor');
      }
      if (parsed.sort !== sort) {
        throw new Error('Cursor sort mismatch');
      }
      return parsed as SearchCursor;
    } catch {
      throw new UnprocessableEntityException('Invalid cursor');
    }
  }

  private buildCursorCondition(
    sort: SearchSort,
    cursor: SearchCursor,
    distanceExpr: Prisma.Sql,
    matchRankExpr: Prisma.Sql,
    sortNameExpr: Prisma.Sql,
  ) {
    if (sort === 'distance') {
      const { lastDistance, lastId } = cursor as SearchCursor & {
        sort: 'distance';
      };
      return Prisma.sql`(
        ${distanceExpr} > ${lastDistance}
        OR (${distanceExpr} = ${lastDistance} AND dp.user_id > ${lastId})
      )`;
    }

    if (sort === 'price_asc') {
      const { lastPrice, lastId } = cursor as SearchCursor & {
        sort: 'price_asc';
      };
      return Prisma.sql`(
        dp.price_cents > ${lastPrice}
        OR (dp.price_cents = ${lastPrice} AND dp.user_id > ${lastId})
      )`;
    }

    if (sort === 'price_desc') {
      const { lastPrice, lastId } = cursor as SearchCursor & {
        sort: 'price_desc';
      };
      return Prisma.sql`(
        dp.price_cents < ${lastPrice}
        OR (dp.price_cents = ${lastPrice} AND dp.user_id > ${lastId})
      )`;
    }

    if (sort === 'name_asc') {
      const { lastName, lastId } = cursor as SearchCursor & {
        sort: 'name_asc';
      };
      return Prisma.sql`(
        ${sortNameExpr} > ${lastName}
        OR (${sortNameExpr} = ${lastName} AND dp.user_id > ${lastId})
      )`;
    }

    if (sort === 'name_desc') {
      const { lastName, lastId } = cursor as SearchCursor & {
        sort: 'name_desc';
      };
      return Prisma.sql`(
        ${sortNameExpr} < ${lastName}
        OR (${sortNameExpr} = ${lastName} AND dp.user_id > ${lastId})
      )`;
    }

    const { lastRank, lastName, lastId } = cursor as SearchCursor & {
      sort: 'relevance';
    };
    return Prisma.sql`(
      ${matchRankExpr} > ${lastRank}
      OR (
        ${matchRankExpr} = ${lastRank}
        AND (
          ${sortNameExpr} > ${lastName}
          OR (${sortNameExpr} = ${lastName} AND dp.user_id > ${lastId})
        )
      )
    )`;
  }

  private buildNextCursor(
    sort: SearchSort,
    row: {
      doctor_user_id: string;
      price_cents: number;
      distance_meters: number | null;
      match_rank: number;
      sort_name: string;
    },
  ): SearchCursor {
    if (sort === 'distance') {
      return {
        sort,
        lastDistance: row.distance_meters ?? 0,
        lastId: row.doctor_user_id,
      };
    }
    if (sort === 'price_asc' || sort === 'price_desc') {
      return {
        sort,
        lastPrice: row.price_cents,
        lastId: row.doctor_user_id,
      };
    }
    if (sort === 'name_asc' || sort === 'name_desc') {
      return {
        sort,
        lastName: row.sort_name,
        lastId: row.doctor_user_id,
      };
    }
    return {
      sort: 'relevance',
      lastRank: row.match_rank,
      lastName: row.sort_name,
      lastId: row.doctor_user_id,
    };
  }

  private isDebugEnabled(): boolean {
    return (
      process.env.NODE_ENV === 'test' ||
      String(process.env.DEBUG_SEARCH).toLowerCase() === 'true'
    );
  }
}
