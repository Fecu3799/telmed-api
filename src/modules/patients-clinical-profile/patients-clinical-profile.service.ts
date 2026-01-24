import { Injectable, NotFoundException } from '@nestjs/common';
import { ClinicalSourceType, ClinicalVerificationStatus } from '@prisma/client';
import type { Actor } from '../../common/types/actor.type';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ClinicalAllergyCreateDto } from './dto/clinical-allergy-create.dto';
import { ClinicalAllergyPatchDto } from './dto/clinical-allergy-patch.dto';
import { ClinicalAllergyVerifyDto } from './dto/clinical-allergy-verify.dto';
import { ClinicalMedicationCreateDto } from './dto/clinical-medication-create.dto';
import { ClinicalMedicationPatchDto } from './dto/clinical-medication-patch.dto';
import { ClinicalMedicationVerifyDto } from './dto/clinical-medication-verify.dto';
import { ClinicalConditionCreateDto } from './dto/clinical-condition-create.dto';
import { ClinicalConditionPatchDto } from './dto/clinical-condition-patch.dto';
import { ClinicalConditionVerifyDto } from './dto/clinical-condition-verify.dto';
import { ClinicalProcedureCreateDto } from './dto/clinical-procedure-create.dto';
import { ClinicalProcedurePatchDto } from './dto/clinical-procedure-patch.dto';
import { ClinicalProcedureVerifyDto } from './dto/clinical-procedure-verify.dto';
import { PatientsClinicalProfileAccessService } from './patients-clinical-profile-access.service';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

@Injectable()
export class PatientsClinicalProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessService: PatientsClinicalProfileAccessService,
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

  private async listAllergies(
    patientUserId: string,
    options: { page?: number; pageSize?: number },
  ) {
    const { page, pageSize, skip } = this.resolvePaging(
      options.page,
      options.pageSize,
    );

    const where = {
      patientUserId,
      deletedAt: null,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.patientClinicalAllergy.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.patientClinicalAllergy.count({ where }),
    ]);

    const hasNextPage = page * pageSize < total;

    return {
      items,
      pageInfo: {
        page,
        pageSize,
        total,
        hasNextPage,
        hasPrevPage: page > 1,
      },
    };
  }

  async listAllergiesForPatient(
    actor: Actor,
    options: { page?: number; pageSize?: number },
  ) {
    return this.listAllergies(actor.id, options);
  }

  async listAllergiesForDoctor(
    actor: Actor,
    patientUserId: string,
    options: { page?: number; pageSize?: number },
  ) {
    await this.accessService.assertDoctorCanAccessPatientOrThrow(
      actor.id,
      patientUserId,
    );

    return this.listAllergies(patientUserId, options);
  }

  async createAllergyForPatient(actor: Actor, dto: ClinicalAllergyCreateDto) {
    const isActive = dto.isActive ?? true;
    let endedAt = dto.endedAt ? new Date(dto.endedAt) : null;

    if (dto.isActive === false && dto.endedAt === undefined) {
      endedAt = new Date();
    }
    if (dto.isActive === true) {
      endedAt = null;
    }

    return this.prisma.patientClinicalAllergy.create({
      data: {
        patientUserId: actor.id,
        name: dto.name,
        notes: dto.notes ?? null,
        sourceType: ClinicalSourceType.patient,
        sourceUserId: actor.id,
        verificationStatus: ClinicalVerificationStatus.unverified,
        verifiedByUserId: null,
        verifiedAt: null,
        isActive,
        endedAt,
      },
    });
  }

  async updateAllergyForPatient(
    actor: Actor,
    allergyId: string,
    dto: ClinicalAllergyPatchDto,
  ) {
    const existing = await this.prisma.patientClinicalAllergy.findFirst({
      where: {
        id: allergyId,
        patientUserId: actor.id,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new NotFoundException('Allergy not found');
    }

    const data: Record<string, unknown> = {};
    let hasClinicalChange = false;

    if (dto.name !== undefined) {
      data.name = dto.name;
      hasClinicalChange = true;
    }
    if (dto.notes !== undefined) {
      data.notes = dto.notes;
      hasClinicalChange = true;
    }
    if (dto.endedAt !== undefined) {
      data.endedAt = dto.endedAt ? new Date(dto.endedAt) : null;
      hasClinicalChange = true;
    }
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
      hasClinicalChange = true;
      if (dto.isActive === false && dto.endedAt === undefined) {
        data.endedAt = new Date();
      }
      if (dto.isActive === true) {
        data.endedAt = null;
      }
    }

    if (!hasClinicalChange) {
      return existing;
    }

    data.verificationStatus = ClinicalVerificationStatus.unverified;
    data.verifiedByUserId = null;
    data.verifiedAt = null;

    return this.prisma.patientClinicalAllergy.update({
      where: { id: allergyId },
      data,
    });
  }

  async deleteAllergyForPatient(actor: Actor, allergyId: string) {
    const existing = await this.prisma.patientClinicalAllergy.findFirst({
      where: {
        id: allergyId,
        patientUserId: actor.id,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new NotFoundException('Allergy not found');
    }

    return this.prisma.patientClinicalAllergy.update({
      where: { id: allergyId },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  async verifyAllergyForDoctor(
    actor: Actor,
    patientUserId: string,
    allergyId: string,
    dto: ClinicalAllergyVerifyDto,
  ) {
    await this.accessService.assertDoctorCanAccessPatientOrThrow(
      actor.id,
      patientUserId,
    );

    const allergy = await this.prisma.patientClinicalAllergy.findFirst({
      where: {
        id: allergyId,
        patientUserId,
        deletedAt: null,
      },
    });

    if (!allergy) {
      throw new NotFoundException('Allergy not found');
    }

    return this.prisma.patientClinicalAllergy.update({
      where: { id: allergyId },
      data: {
        verificationStatus: dto.verificationStatus,
        verifiedByUserId: actor.id,
        verifiedAt: new Date(),
      },
    });
  }

  private async listMedications(
    patientUserId: string,
    options: { page?: number; pageSize?: number },
  ) {
    const { page, pageSize, skip } = this.resolvePaging(
      options.page,
      options.pageSize,
    );

    const where = {
      patientUserId,
      deletedAt: null,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.patientClinicalMedication.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.patientClinicalMedication.count({ where }),
    ]);

    const hasNextPage = page * pageSize < total;

    return {
      items,
      pageInfo: {
        page,
        pageSize,
        total,
        hasNextPage,
        hasPrevPage: page > 1,
      },
    };
  }

  async listMedicationsForPatient(
    actor: Actor,
    options: { page?: number; pageSize?: number },
  ) {
    return this.listMedications(actor.id, options);
  }

  async listMedicationsForDoctor(
    actor: Actor,
    patientUserId: string,
    options: { page?: number; pageSize?: number },
  ) {
    await this.accessService.assertDoctorCanAccessPatientOrThrow(
      actor.id,
      patientUserId,
    );

    return this.listMedications(patientUserId, options);
  }

  async createMedicationForPatient(
    actor: Actor,
    dto: ClinicalMedicationCreateDto,
  ) {
    const isActive = dto.isActive ?? true;
    let endedAt = dto.endedAt ? new Date(dto.endedAt) : null;

    if (dto.isActive === false && dto.endedAt === undefined) {
      endedAt = new Date();
    }
    if (dto.isActive === true) {
      endedAt = null;
    }

    return this.prisma.patientClinicalMedication.create({
      data: {
        patientUserId: actor.id,
        name: dto.name,
        notes: dto.notes ?? null,
        sourceType: ClinicalSourceType.patient,
        sourceUserId: actor.id,
        verificationStatus: ClinicalVerificationStatus.unverified,
        verifiedByUserId: null,
        verifiedAt: null,
        isActive,
        endedAt,
      },
    });
  }

  async updateMedicationForPatient(
    actor: Actor,
    medicationId: string,
    dto: ClinicalMedicationPatchDto,
  ) {
    const existing = await this.prisma.patientClinicalMedication.findFirst({
      where: {
        id: medicationId,
        patientUserId: actor.id,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new NotFoundException('Medication not found');
    }

    const data: Record<string, unknown> = {};
    let hasClinicalChange = false;

    if (dto.name !== undefined) {
      data.name = dto.name;
      hasClinicalChange = true;
    }
    if (dto.notes !== undefined) {
      data.notes = dto.notes;
      hasClinicalChange = true;
    }
    if (dto.endedAt !== undefined) {
      data.endedAt = dto.endedAt ? new Date(dto.endedAt) : null;
      hasClinicalChange = true;
    }
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
      hasClinicalChange = true;
      if (dto.isActive === false && dto.endedAt === undefined) {
        data.endedAt = new Date();
      }
      if (dto.isActive === true) {
        data.endedAt = null;
      }
    }

    if (!hasClinicalChange) {
      return existing;
    }

    data.verificationStatus = ClinicalVerificationStatus.unverified;
    data.verifiedByUserId = null;
    data.verifiedAt = null;

    return this.prisma.patientClinicalMedication.update({
      where: { id: medicationId },
      data,
    });
  }

  async deleteMedicationForPatient(actor: Actor, medicationId: string) {
    const existing = await this.prisma.patientClinicalMedication.findFirst({
      where: {
        id: medicationId,
        patientUserId: actor.id,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new NotFoundException('Medication not found');
    }

    return this.prisma.patientClinicalMedication.update({
      where: { id: medicationId },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  async verifyMedicationForDoctor(
    actor: Actor,
    patientUserId: string,
    medicationId: string,
    dto: ClinicalMedicationVerifyDto,
  ) {
    await this.accessService.assertDoctorCanAccessPatientOrThrow(
      actor.id,
      patientUserId,
    );

    const medication = await this.prisma.patientClinicalMedication.findFirst({
      where: {
        id: medicationId,
        patientUserId,
        deletedAt: null,
      },
    });

    if (!medication) {
      throw new NotFoundException('Medication not found');
    }

    return this.prisma.patientClinicalMedication.update({
      where: { id: medicationId },
      data: {
        verificationStatus: dto.verificationStatus,
        verifiedByUserId: actor.id,
        verifiedAt: new Date(),
      },
    });
  }

  private async listConditions(
    patientUserId: string,
    options: { page?: number; pageSize?: number },
  ) {
    const { page, pageSize, skip } = this.resolvePaging(
      options.page,
      options.pageSize,
    );

    const where = {
      patientUserId,
      deletedAt: null,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.patientClinicalCondition.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.patientClinicalCondition.count({ where }),
    ]);

    const hasNextPage = page * pageSize < total;

    return {
      items,
      pageInfo: {
        page,
        pageSize,
        total,
        hasNextPage,
        hasPrevPage: page > 1,
      },
    };
  }

  async listConditionsForPatient(
    actor: Actor,
    options: { page?: number; pageSize?: number },
  ) {
    return this.listConditions(actor.id, options);
  }

  async listConditionsForDoctor(
    actor: Actor,
    patientUserId: string,
    options: { page?: number; pageSize?: number },
  ) {
    await this.accessService.assertDoctorCanAccessPatientOrThrow(
      actor.id,
      patientUserId,
    );

    return this.listConditions(patientUserId, options);
  }

  async createConditionForPatient(
    actor: Actor,
    dto: ClinicalConditionCreateDto,
  ) {
    const isActive = dto.isActive ?? true;
    let endedAt = dto.endedAt ? new Date(dto.endedAt) : null;

    if (dto.isActive === false && dto.endedAt === undefined) {
      endedAt = new Date();
    }
    if (dto.isActive === true) {
      endedAt = null;
    }

    return this.prisma.patientClinicalCondition.create({
      data: {
        patientUserId: actor.id,
        name: dto.name,
        notes: dto.notes ?? null,
        sourceType: ClinicalSourceType.patient,
        sourceUserId: actor.id,
        verificationStatus: ClinicalVerificationStatus.unverified,
        verifiedByUserId: null,
        verifiedAt: null,
        isActive,
        endedAt,
      },
    });
  }

  async updateConditionForPatient(
    actor: Actor,
    conditionId: string,
    dto: ClinicalConditionPatchDto,
  ) {
    const existing = await this.prisma.patientClinicalCondition.findFirst({
      where: {
        id: conditionId,
        patientUserId: actor.id,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new NotFoundException('Condition not found');
    }

    const data: Record<string, unknown> = {};
    let hasClinicalChange = false;

    if (dto.name !== undefined) {
      data.name = dto.name;
      hasClinicalChange = true;
    }
    if (dto.notes !== undefined) {
      data.notes = dto.notes;
      hasClinicalChange = true;
    }
    if (dto.endedAt !== undefined) {
      data.endedAt = dto.endedAt ? new Date(dto.endedAt) : null;
      hasClinicalChange = true;
    }
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
      hasClinicalChange = true;
      if (dto.isActive === false && dto.endedAt === undefined) {
        data.endedAt = new Date();
      }
      if (dto.isActive === true) {
        data.endedAt = null;
      }
    }

    if (!hasClinicalChange) {
      return existing;
    }

    data.verificationStatus = ClinicalVerificationStatus.unverified;
    data.verifiedByUserId = null;
    data.verifiedAt = null;

    return this.prisma.patientClinicalCondition.update({
      where: { id: conditionId },
      data,
    });
  }

  async deleteConditionForPatient(actor: Actor, conditionId: string) {
    const existing = await this.prisma.patientClinicalCondition.findFirst({
      where: {
        id: conditionId,
        patientUserId: actor.id,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new NotFoundException('Condition not found');
    }

    return this.prisma.patientClinicalCondition.update({
      where: { id: conditionId },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  async verifyConditionForDoctor(
    actor: Actor,
    patientUserId: string,
    conditionId: string,
    dto: ClinicalConditionVerifyDto,
  ) {
    await this.accessService.assertDoctorCanAccessPatientOrThrow(
      actor.id,
      patientUserId,
    );

    const condition = await this.prisma.patientClinicalCondition.findFirst({
      where: {
        id: conditionId,
        patientUserId,
        deletedAt: null,
      },
    });

    if (!condition) {
      throw new NotFoundException('Condition not found');
    }

    return this.prisma.patientClinicalCondition.update({
      where: { id: conditionId },
      data: {
        verificationStatus: dto.verificationStatus,
        verifiedByUserId: actor.id,
        verifiedAt: new Date(),
      },
    });
  }

  private async listProcedures(
    patientUserId: string,
    options: { page?: number; pageSize?: number },
  ) {
    const { page, pageSize, skip } = this.resolvePaging(
      options.page,
      options.pageSize,
    );

    const where = {
      patientUserId,
      deletedAt: null,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.patientClinicalProcedure.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.patientClinicalProcedure.count({ where }),
    ]);

    const hasNextPage = page * pageSize < total;

    return {
      items,
      pageInfo: {
        page,
        pageSize,
        total,
        hasNextPage,
        hasPrevPage: page > 1,
      },
    };
  }

  async listProceduresForPatient(
    actor: Actor,
    options: { page?: number; pageSize?: number },
  ) {
    return this.listProcedures(actor.id, options);
  }

  async listProceduresForDoctor(
    actor: Actor,
    patientUserId: string,
    options: { page?: number; pageSize?: number },
  ) {
    await this.accessService.assertDoctorCanAccessPatientOrThrow(
      actor.id,
      patientUserId,
    );

    return this.listProcedures(patientUserId, options);
  }

  async createProcedureForPatient(
    actor: Actor,
    dto: ClinicalProcedureCreateDto,
  ) {
    const isActive = dto.isActive ?? true;
    let endedAt = dto.endedAt ? new Date(dto.endedAt) : null;

    if (dto.isActive === false && dto.endedAt === undefined) {
      endedAt = new Date();
    }
    if (dto.isActive === true) {
      endedAt = null;
    }

    return this.prisma.patientClinicalProcedure.create({
      data: {
        patientUserId: actor.id,
        name: dto.name,
        notes: dto.notes ?? null,
        sourceType: ClinicalSourceType.patient,
        sourceUserId: actor.id,
        verificationStatus: ClinicalVerificationStatus.unverified,
        verifiedByUserId: null,
        verifiedAt: null,
        isActive,
        endedAt,
      },
    });
  }

  async updateProcedureForPatient(
    actor: Actor,
    procedureId: string,
    dto: ClinicalProcedurePatchDto,
  ) {
    const existing = await this.prisma.patientClinicalProcedure.findFirst({
      where: {
        id: procedureId,
        patientUserId: actor.id,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new NotFoundException('Procedure not found');
    }

    const data: Record<string, unknown> = {};
    let hasClinicalChange = false;

    if (dto.name !== undefined) {
      data.name = dto.name;
      hasClinicalChange = true;
    }
    if (dto.notes !== undefined) {
      data.notes = dto.notes;
      hasClinicalChange = true;
    }
    if (dto.endedAt !== undefined) {
      data.endedAt = dto.endedAt ? new Date(dto.endedAt) : null;
      hasClinicalChange = true;
    }
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
      hasClinicalChange = true;
      if (dto.isActive === false && dto.endedAt === undefined) {
        data.endedAt = new Date();
      }
      if (dto.isActive === true) {
        data.endedAt = null;
      }
    }

    if (!hasClinicalChange) {
      return existing;
    }

    data.verificationStatus = ClinicalVerificationStatus.unverified;
    data.verifiedByUserId = null;
    data.verifiedAt = null;

    return this.prisma.patientClinicalProcedure.update({
      where: { id: procedureId },
      data,
    });
  }

  async deleteProcedureForPatient(actor: Actor, procedureId: string) {
    const existing = await this.prisma.patientClinicalProcedure.findFirst({
      where: {
        id: procedureId,
        patientUserId: actor.id,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new NotFoundException('Procedure not found');
    }

    return this.prisma.patientClinicalProcedure.update({
      where: { id: procedureId },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  async verifyProcedureForDoctor(
    actor: Actor,
    patientUserId: string,
    procedureId: string,
    dto: ClinicalProcedureVerifyDto,
  ) {
    await this.accessService.assertDoctorCanAccessPatientOrThrow(
      actor.id,
      patientUserId,
    );

    const procedure = await this.prisma.patientClinicalProcedure.findFirst({
      where: {
        id: procedureId,
        patientUserId,
        deletedAt: null,
      },
    });

    if (!procedure) {
      throw new NotFoundException('Procedure not found');
    }

    return this.prisma.patientClinicalProcedure.update({
      where: { id: procedureId },
      data: {
        verificationStatus: dto.verificationStatus,
        verifiedByUserId: actor.id,
        verifiedAt: new Date(),
      },
    });
  }
}
