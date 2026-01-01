import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { PatientDocumentType } from '@prisma/client';

export class PatientIdentityPatchDto {
  @ApiPropertyOptional({ example: 'Juan' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  legalFirstName?: string;

  @ApiPropertyOptional({ example: 'Perez' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  legalLastName?: string;

  @ApiPropertyOptional({ example: 'DNI', enum: PatientDocumentType })
  @IsOptional()
  @IsEnum(PatientDocumentType)
  documentType?: PatientDocumentType;

  @ApiPropertyOptional({ example: '30123456' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  documentNumber?: string;

  @ApiPropertyOptional({ example: 'AR' })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @MinLength(2)
  documentCountry?: string;

  @ApiPropertyOptional({ example: '1990-05-10' })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional({ example: '+54 11 5555 5555' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  phone?: string | null;

  @ApiPropertyOptional({ example: 'Av. Siempre Viva 123' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  addressText?: string | null;
}
