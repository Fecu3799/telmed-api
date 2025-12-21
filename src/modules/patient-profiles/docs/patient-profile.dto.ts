import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PatientProfileDto {
  @ApiProperty({ example: 'b9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  userId!: string;

  @ApiProperty({ example: 'Juan' })
  firstName!: string;

  @ApiProperty({ example: 'Perez' })
  lastName!: string;

  @ApiPropertyOptional({ example: '+54 11 5555 5555' })
  phone?: string | null;

  @ApiProperty({ example: '2025-01-01T12:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2025-01-01T12:00:00.000Z' })
  updatedAt!: string;
}
