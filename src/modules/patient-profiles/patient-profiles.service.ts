import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { PatientProfilePatchDto } from './dto/patient-profile-patch.dto';
import { PatientProfilePutDto } from './dto/patient-profile-put.dto';

@Injectable()
export class PatientProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const profile = await this.prisma.patientProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Patient profile not found');
    }

    return profile;
  }

  async upsertProfile(userId: string, dto: PatientProfilePutDto) {
    return this.prisma.patientProfile.upsert({
      where: { userId },
      create: {
        userId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone ?? null,
      },
      update: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone ?? null,
      },
    });
  }

  async patchProfile(userId: string, dto: PatientProfilePatchDto) {
    const existing = await this.prisma.patientProfile.findUnique({
      where: { userId },
      select: { userId: true },
    });

    if (!existing) {
      throw new NotFoundException('Patient profile not found');
    }

    const data: {
      firstName?: string;
      lastName?: string;
      phone?: string | null;
    } = {};

    if (dto.firstName !== undefined) {
      data.firstName = dto.firstName;
    }
    if (dto.lastName !== undefined) {
      data.lastName = dto.lastName;
    }
    if (dto.phone !== undefined) {
      data.phone = dto.phone;
    }

    if (Object.keys(data).length === 0) {
      return this.prisma.patientProfile.findUniqueOrThrow({
        where: { userId },
      });
    }

    return this.prisma.patientProfile.update({
      where: { userId },
      data,
    });
  }
}
