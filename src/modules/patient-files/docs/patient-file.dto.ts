import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PatientFileStatus,
  PatientFileCategory,
  UserRole,
} from '@prisma/client';

export class PatientFileDto {
  @ApiProperty({ example: 'pf9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  id!: string;

  @ApiProperty({ example: 'ready', enum: PatientFileStatus })
  status!: PatientFileStatus;

  @ApiProperty({ example: 'informe_laboratorio.pdf' })
  originalName!: string;

  @ApiProperty({ example: 'application/pdf' })
  mimeType!: string;

  @ApiProperty({ example: 245760 })
  sizeBytes!: number;

  @ApiProperty({ example: 'lab', enum: PatientFileCategory })
  category!: PatientFileCategory;

  @ApiPropertyOptional({
    example: 'Análisis de sangre completo',
    nullable: true,
  })
  notes?: string | null;

  @ApiProperty({ example: 'u9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  uploadedByUserId!: string;

  @ApiProperty({ example: 'doctor', enum: UserRole })
  uploadedByRole!: UserRole;

  @ApiPropertyOptional({
    example: 'c9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a',
    nullable: true,
  })
  relatedConsultationId?: string | null;

  @ApiProperty({ example: '2025-01-05T14:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2025-01-05T14:05:00.000Z' })
  updatedAt!: string;
}
