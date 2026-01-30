import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import {
  GEO_GEOCODER,
  type GeoGeocodingService,
} from '../../geo/geo-geocoding.service';
import { DoctorProfilePatchDto } from './dto/doctor-profile-patch.dto';
import { DoctorProfilePutDto } from './dto/doctor-profile-put.dto';
import { DoctorSpecialtiesPutDto } from './dto/doctor-specialties-put.dto';
import { LocationDto } from './dto/location.dto';

/**
 * Gestiona el perfil del doctor:
 * - Implementa la lógica de negocio y persistencia del perfil profesional del doctor, incluyendo:
 *   - Perfil base (nombre, bio, precio).
 *   - Ubicación geográfica (PostGIS geography(Point, 4326)) + lectura/escritura por SQL.
 *   - Especialidades (tabla puente doctor_specialties con specialties)
 *
 * How it works:
 * - Perfil
 *   - getProfile(userId): busca doctorProfile por userId, si no existe 404. Trae location con query raw.
 *   - upsertProfile(userId, dto): upsert del perfil (create/update). Si viene dto.location, setea geo y devuelve perfil con location.
 *   - patchProfile(userId, dto): valida que existe, arma data solo con campos presentes,
 *     actualiza solo si hay cambios; si viene location, actualiza.
 * - Ubicación (PostGIS):
 *   - setLocation(userId, lat, lng): hace UPDATE por $executeRaw
 *   - Luego intenta reverseGeocode(lat,lng) y si resuelve ciudad/region/pais, los persiste.
 *     Si el geocoding falla, no rompe la operación.
 *   - getLocation(userId): lee la ubicación desde DB con $queryRaw y retorna {lat,lng} o null.
 * - Especialidades:
 *   - getSpecialties(userId): valida que existe perfil y trae doctorSpecialties con include: {specialty: true}; devuelve {id, name}.
 *   - setSpecialties(userId, dto): deduplica (borra duplicados) IDs, valida que existan en specialties,
 *     y aplica un $transaction de "replace": borra todas y recrea con createMany si hay IDs.
 */

@Injectable()
export class DoctorProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(GEO_GEOCODER)
    private readonly geocoding: GeoGeocodingService,
  ) {}

  async getProfile(userId: string) {
    const profile = await this.prisma.doctorProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Doctor profile not found');
    }

    const location = await this.getLocation(userId);

    return {
      ...profile,
      location,
    };
  }

  async upsertProfile(userId: string, dto: DoctorProfilePutDto) {
    const profile = await this.prisma.doctorProfile.upsert({
      where: { userId },
      create: {
        userId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        bio: dto.bio ?? null,
        priceCents: dto.priceCents,
        currency: dto.currency ?? 'ARS',
        isActive: true,
      },
      update: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        bio: dto.bio ?? null,
        priceCents: dto.priceCents,
        currency: dto.currency ?? 'ARS',
        isActive: true,
      },
    });

    if (dto.location) {
      await this.setLocation(userId, dto.location.lat, dto.location.lng);
    }

    const location = await this.getLocation(userId);

    return {
      ...profile,
      location,
    };
  }

  async patchProfile(userId: string, dto: DoctorProfilePatchDto) {
    const existing = await this.prisma.doctorProfile.findUnique({
      where: { userId },
      select: { userId: true },
    });

    if (!existing) {
      throw new NotFoundException('Doctor profile not found');
    }

    const data: {
      bio?: string | null;
      priceCents?: number;
      currency?: string;
      firstName?: string;
      lastName?: string;
      isActive?: boolean;
    } = {};

    if (dto.bio !== undefined) {
      data.bio = dto.bio;
    }
    if (dto.firstName !== undefined) {
      data.firstName = dto.firstName;
    }
    if (dto.lastName !== undefined) {
      data.lastName = dto.lastName;
    }
    if (dto.priceCents !== undefined) {
      data.priceCents = dto.priceCents;
    }
    if (dto.currency !== undefined) {
      data.currency = dto.currency;
    }

    if (Object.keys(data).length > 0) {
      data.isActive = true;
    }

    const profile =
      Object.keys(data).length === 0
        ? await this.prisma.doctorProfile.findUniqueOrThrow({
            where: { userId },
          })
        : await this.prisma.doctorProfile.update({
            where: { userId },
            data,
          });

    if (dto.location) {
      await this.setLocation(userId, dto.location.lat, dto.location.lng);
    }

    const location = await this.getLocation(userId);

    return {
      ...profile,
      location,
    };
  }

  async getSpecialties(userId: string) {
    const profile = await this.prisma.doctorProfile.findUnique({
      where: { userId },
      select: { userId: true },
    });

    if (!profile) {
      throw new NotFoundException('Doctor profile not found');
    }

    const specialties = await this.prisma.doctorSpecialty.findMany({
      where: { doctorUserId: userId, specialty: { isActive: true } },
      include: { specialty: true },
    });

    return {
      specialties: specialties.map((item) => ({
        id: item.specialty.id,
        name: item.specialty.name,
      })),
    };
  }

  async setSpecialties(userId: string, dto: DoctorSpecialtiesPutDto) {
    const profile = await this.prisma.doctorProfile.findUnique({
      where: { userId },
      select: { userId: true },
    });

    if (!profile) {
      throw new NotFoundException('Doctor profile not found');
    }

    const uniqueIds = Array.from(new Set(dto.specialtyIds));
    if (uniqueIds.length > 0) {
      const found = await this.prisma.specialty.findMany({
        where: { id: { in: uniqueIds }, isActive: true },
        select: { id: true },
      });

      if (found.length !== uniqueIds.length) {
        throw new UnprocessableEntityException({
          type: 'https://telmed/errors/specialty-invalid',
          title: 'Invalid specialty',
          detail: 'One or more specialtyIds are invalid or inactive',
          status: 422,
          extensions: { code: 'specialty_invalid' },
        });
      }
    }

    await this.prisma.$transaction([
      this.prisma.doctorSpecialty.deleteMany({
        where: { doctorUserId: userId },
      }),
      ...(uniqueIds.length > 0
        ? [
            this.prisma.doctorSpecialty.createMany({
              data: uniqueIds.map((id) => ({
                doctorUserId: userId,
                specialtyId: id,
              })),
            }),
          ]
        : []),
    ]);

    return this.getSpecialties(userId);
  }

  async updateLocation(userId: string, dto: LocationDto) {
    const existing = await this.prisma.doctorProfile.findUnique({
      where: { userId },
      select: { userId: true },
    });
    if (!existing) {
      throw new NotFoundException('Doctor profile not found');
    }

    await this.setLocation(userId, dto.lat, dto.lng);
    return this.getProfile(userId);
  }

  private async getLocation(userId: string) {
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

  private async setLocation(userId: string, lat: number, lng: number) {
    await this.prisma.$executeRaw(
      Prisma.sql`
        UPDATE doctor_profiles
        SET location = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        WHERE user_id = ${userId}
      `,
    );

    try {
      const resolved = await this.geocoding.reverseGeocode(lat, lng);
      if (resolved) {
        await this.prisma.doctorProfile.update({
          where: { userId },
          data: {
            city: resolved.city,
            region: resolved.region,
            countryCode: resolved.countryCode,
          },
        });
      }
    } catch {
      // Avoid failing location updates when geocoding is unavailable.
    }
  }
}
