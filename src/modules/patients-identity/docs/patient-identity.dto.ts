import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PatientDocumentType } from '@prisma/client';

export class PatientIdentityDto {
  @ApiProperty({ example: 'p9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  id!: string;

  @ApiProperty({ example: 'u9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  userId!: string;

  @ApiProperty({ example: 'Juan' })
  legalFirstName!: string;

  @ApiProperty({ example: 'Perez' })
  legalLastName!: string;

  @ApiProperty({ example: 'DNI', enum: PatientDocumentType })
  documentType!: PatientDocumentType;

  @ApiProperty({ example: '30123456' })
  documentNumber!: string;

  @ApiProperty({ example: 'AR' })
  documentCountry!: string;

  @ApiProperty({ example: '1990-05-10' })
  birthDate!: string;

  @ApiPropertyOptional({ example: '+54 11 5555 5555' })
  phone?: string | null;

  @ApiPropertyOptional({ example: 'Av. Siempre Viva 123' })
  addressText?: string | null;

  @ApiPropertyOptional({ example: 'Maria Perez' })
  emergencyContactName?: string | null;

  @ApiPropertyOptional({ example: '+54 11 5555 1234' })
  emergencyContactPhone?: string | null;

  @ApiPropertyOptional({ example: 'OSDE' })
  insuranceName?: string | null;

  @ApiProperty({ example: '2025-01-05T13:50:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2025-01-05T13:55:00.000Z' })
  updatedAt!: string;
}
