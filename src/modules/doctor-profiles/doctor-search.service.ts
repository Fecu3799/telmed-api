import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { DoctorSearchQueryDto } from './dto/doctor-search-query.dto';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

@Injectable()
export class DoctorSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: DoctorSearchQueryDto) {
    const hasGeo = query.lat !== undefined || query.lng !== undefined;
    if (hasGeo && (query.lat === undefined || query.lng === undefined)) {
      throw new BadRequestException('lat and lng are required together');
    }
    if (hasGeo && query.radiusKm === undefined) {
      throw new BadRequestException(
        'radiusKm is required when using geo search',
      );
    }

    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const offset = query.offset ?? 0;

    const conditions: Prisma.Sql[] = [
      Prisma.sql`u.status = 'active'`,
      Prisma.sql`dp.is_active = true`,
    ];

    if (query.maxPriceCents !== undefined) {
      conditions.push(Prisma.sql`dp.price_cents <= ${query.maxPriceCents}`);
    }

    let like: string | null = null;
    if (query.q) {
      const trimmed = query.q.trim();
      if (trimmed.length > 0) {
        like = `%${trimmed}%`;
        conditions.push(
          Prisma.sql`(
            u.display_name ILIKE ${like}
            OR concat_ws(' ', dp.first_name, dp.last_name) ILIKE ${like}
          )`,
        );
      }
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

    let distanceSql = Prisma.sql`NULL::double precision`;
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
      distanceSql = Prisma.sql`
        ST_Distance(
          dp.location,
          ST_SetSRID(ST_MakePoint(${query.lng}, ${query.lat}), 4326)::geography
        )
      `;
    }

    const sort = query.sort ?? (hasGeo ? 'distance' : 'name');
    let orderBy = Prisma.sql`dp.user_id ASC`;
    if (sort === 'distance' && hasGeo) {
      orderBy = Prisma.sql`distance_meters ASC, dp.user_id ASC`;
    } else if (sort === 'price') {
      orderBy = Prisma.sql`dp.price_cents ASC, dp.user_id ASC`;
    } else if (sort === 'name') {
      if (like) {
        orderBy = Prisma.sql`
          CASE
            WHEN u.display_name IS NOT NULL AND u.display_name ILIKE ${like} THEN 0
            WHEN concat_ws(' ', dp.first_name, dp.last_name) ILIKE ${like} THEN 1
            ELSE 2
          END ASC,
          u.display_name ASC NULLS LAST,
          concat_ws(' ', dp.first_name, dp.last_name) ASC,
          dp.user_id ASC
        `;
      } else {
        orderBy = Prisma.sql`
          (u.display_name IS NULL) ASC,
          u.display_name ASC NULLS LAST,
          concat_ws(' ', dp.first_name, dp.last_name) ASC,
          dp.user_id ASC
        `;
      }
    }

    const whereSql = Prisma.sql`${Prisma.join(conditions, ' AND ')}`;

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
        ${distanceSql} AS distance_meters
      FROM doctor_profiles dp
      JOIN users u ON u.id = dp.user_id
      WHERE ${whereSql}
      ORDER BY ${orderBy}
      LIMIT ${limit}
      OFFSET ${offset}
    `);

    const doctorIds = rows.map((row) => row.doctor_user_id);
    const specialties = await this.prisma.doctorSpecialty.findMany({
      where: { doctorUserId: { in: doctorIds } },
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

    const items = rows.map((row) => ({
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

    return { items, limit, offset };
  }
}
