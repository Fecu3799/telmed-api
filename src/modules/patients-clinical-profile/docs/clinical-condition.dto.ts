import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClinicalSourceType, ClinicalVerificationStatus } from '@prisma/client';

export class ClinicalConditionDto {
  @ApiProperty({ example: 'a9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  id!: string;

  @ApiProperty({ example: 'u9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  patientUserId!: string;

  @ApiProperty({ example: 'Hypertension' })
  name!: string;

  @ApiPropertyOptional({ example: 'Diagnosed in 2021' })
  notes?: string | null;

  @ApiProperty({
    enum: ClinicalSourceType,
    example: ClinicalSourceType.patient,
  })
  sourceType!: ClinicalSourceType;

  @ApiPropertyOptional({ example: 'u9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  sourceUserId?: string | null;

  @ApiProperty({
    enum: ClinicalVerificationStatus,
    example: ClinicalVerificationStatus.unverified,
  })
  verificationStatus!: ClinicalVerificationStatus;

  @ApiPropertyOptional({ example: 'u9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  verifiedByUserId?: string | null;

  @ApiPropertyOptional({ example: '2025-01-05T13:50:00.000Z' })
  verifiedAt?: string | null;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiPropertyOptional({ example: '2025-01-05T13:50:00.000Z' })
  endedAt?: string | null;

  @ApiPropertyOptional({ example: '2025-01-05T13:50:00.000Z' })
  deletedAt?: string | null;

  @ApiProperty({ example: '2025-01-05T13:50:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2025-01-05T13:55:00.000Z' })
  updatedAt!: string;
}
