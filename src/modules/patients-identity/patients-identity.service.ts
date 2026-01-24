import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { PatientIdentityPatchDto } from './dto/patient-identity-patch.dto';

/**
 * Gestiona la identidad legal del paciente:
 * - Implementa la lógica de identidad del paciente sobre la tabla patient:
 *   crea el registro la primera vez (minimos obligatorios) y luego permite updates parciales.
 *
 * How it works:
 * - getIdentity(userId): busca patient por userId; si no existe, 404.
 * - upsertIdentity(userId, dto):
 *    - Si no existe: valida el input completo. Si falta algo, 422.;
 *      Si esta OK create y setea defaults (documentCountry=AR).
 *    - Si existe: arma data solo con campos presentes en DTO (update parcial).
 *      Si el DTO vino vacío, devuelve el existing sin pegarle a DB.
 * - getIdentityStatus(userId): devuelve {exists, isComplete, patientId}
 *   con un select mínimo, usando isIdentityComplete.
 */

type PatientIdentity = {
  legalFirstName: string | null;
  legalLastName: string | null;
  documentType: string | null;
  documentNumber: string | null;
  documentCountry: string | null;
  birthDate: Date | null;
};

@Injectable()
export class PatientsIdentityService {
  constructor(private readonly prisma: PrismaService) {}

  async getIdentity(userId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { userId },
    });

    if (!patient) {
      throw new NotFoundException('Patient identity not found');
    }

    return patient;
  }

  async upsertIdentity(userId: string, dto: PatientIdentityPatchDto) {
    const existing = await this.prisma.patient.findUnique({
      where: { userId },
    });

    if (!existing) {
      // For the first identity record we require the full legal dataset.
      if (!this.isIdentityCompleteInput(dto)) {
        throw new UnprocessableEntityException(
          'Patient identity is incomplete',
        );
      }

      return this.prisma.patient.create({
        data: {
          userId,
          legalFirstName: dto.legalFirstName!,
          legalLastName: dto.legalLastName!,
          documentType: dto.documentType!,
          documentNumber: dto.documentNumber!,
          documentCountry: dto.documentCountry ?? 'AR',
          birthDate: new Date(dto.birthDate!),
          phone: dto.phone ?? null,
          addressText: dto.addressText ?? null,
          emergencyContactName: dto.emergencyContactName ?? null,
          emergencyContactPhone: dto.emergencyContactPhone ?? null,
          insuranceName: dto.insuranceName ?? null,
        },
      });
    }

    const data: Record<string, unknown> = {};
    if (dto.legalFirstName !== undefined) {
      data.legalFirstName = dto.legalFirstName;
    }
    if (dto.legalLastName !== undefined) {
      data.legalLastName = dto.legalLastName;
    }
    if (dto.documentType !== undefined) {
      data.documentType = dto.documentType;
    }
    if (dto.documentNumber !== undefined) {
      data.documentNumber = dto.documentNumber;
    }
    if (dto.documentCountry !== undefined) {
      data.documentCountry = dto.documentCountry;
    }
    if (dto.birthDate !== undefined) {
      data.birthDate = new Date(dto.birthDate);
    }
    if (dto.phone !== undefined) {
      data.phone = dto.phone;
    }
    if (dto.addressText !== undefined) {
      data.addressText = dto.addressText;
    }
    if (dto.emergencyContactName !== undefined) {
      data.emergencyContactName = dto.emergencyContactName;
    }
    if (dto.emergencyContactPhone !== undefined) {
      data.emergencyContactPhone = dto.emergencyContactPhone;
    }
    if (dto.insuranceName !== undefined) {
      data.insuranceName = dto.insuranceName;
    }

    if (Object.keys(data).length === 0) {
      return existing;
    }

    return this.prisma.patient.update({
      where: { userId },
      data,
    });
  }

  async getIdentityStatus(userId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { userId },
      select: {
        id: true,
        legalFirstName: true,
        legalLastName: true,
        documentType: true,
        documentNumber: true,
        documentCountry: true,
        birthDate: true,
      },
    });

    if (!patient) {
      return { exists: false, isComplete: false, patientId: null };
    }

    return {
      exists: true,
      isComplete: this.isIdentityComplete(patient),
      patientId: patient.id,
    };
  }

  isIdentityComplete(identity: PatientIdentity) {
    return Boolean(
      identity.legalFirstName &&
      identity.legalLastName &&
      identity.documentType &&
      identity.documentNumber &&
      identity.documentCountry &&
      identity.birthDate,
    );
  }

  private isIdentityCompleteInput(dto: PatientIdentityPatchDto) {
    return Boolean(
      dto.legalFirstName &&
      dto.legalLastName &&
      dto.documentType &&
      dto.documentNumber &&
      (dto.documentCountry ?? 'AR') &&
      dto.birthDate,
    );
  }
}
