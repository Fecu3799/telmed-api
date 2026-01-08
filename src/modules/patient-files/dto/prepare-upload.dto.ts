import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { PatientFileCategory } from '@prisma/client';

export class PrepareUploadDto {
  @ApiProperty({ example: 'informe_laboratorio.pdf' })
  @IsString()
  originalName!: string;

  @ApiProperty({ example: 'application/pdf' })
  @IsString()
  mimeType!: string;

  @ApiProperty({ example: 245760, minimum: 1 })
  @IsInt()
  @Min(1)
  sizeBytes!: number;

  @ApiPropertyOptional({
    example: 'lab',
    enum: PatientFileCategory,
    description: 'File category',
  })
  @IsOptional()
  @IsEnum(PatientFileCategory)
  category?: PatientFileCategory;

  @ApiPropertyOptional({
    example: 'Análisis de sangre completo',
    description: 'Optional notes about the file',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    example: 'c9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a',
    description: 'Optional consultation ID this file is related to',
  })
  @IsOptional()
  @IsUUID()
  relatedConsultationId?: string;

  @ApiPropertyOptional({
    example: 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
    description: 'SHA-256 checksum (64 hex characters)',
  })
  @IsOptional()
  @IsString()
  sha256?: string;
}
