import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class PatientsClinicalProfileAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async assertDoctorCanAccessPatientOrThrow(
    doctorUserId: string,
    patientUserId: string,
  ) {
    const hasConsultation = await this.prisma.consultation.findFirst({
      where: {
        doctorUserId,
        patientUserId,
      },
      select: { id: true },
    });

    if (!hasConsultation) {
      throw new ForbiddenException('Forbidden');
    }
  }
}
