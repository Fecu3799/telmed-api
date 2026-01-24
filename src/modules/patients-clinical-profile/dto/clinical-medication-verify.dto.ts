import { ApiProperty } from '@nestjs/swagger';
import { ClinicalVerificationStatus } from '@prisma/client';
import { IsEnum, IsIn } from 'class-validator';

export class ClinicalMedicationVerifyDto {
  @ApiProperty({
    enum: ClinicalVerificationStatus,
    example: ClinicalVerificationStatus.verified,
  })
  @IsEnum(ClinicalVerificationStatus)
  @IsIn([
    ClinicalVerificationStatus.verified,
    ClinicalVerificationStatus.disputed,
  ])
  verificationStatus!: ClinicalVerificationStatus;
}
