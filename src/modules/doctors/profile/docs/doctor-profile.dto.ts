import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DoctorProfileLocationDto {
  @ApiProperty({ example: -34.6037 })
  lat!: number;

  @ApiProperty({ example: -58.3816 })
  lng!: number;
}

export class DoctorProfileDto {
  @ApiProperty({ example: 'b9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  userId!: string;

  @ApiPropertyOptional({ example: 'Maria' })
  firstName?: string | null;

  @ApiPropertyOptional({ example: 'Gonzalez' })
  lastName?: string | null;

  @ApiPropertyOptional({ example: 'Cardiologo con 10 anos de experiencia.' })
  bio?: string | null;

  @ApiProperty({ example: 150000 })
  priceCents!: number;

  @ApiProperty({ example: 'ARS' })
  currency!: string;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: 'unverified' })
  verificationStatus!: string;

  @ApiPropertyOptional({ type: DoctorProfileLocationDto })
  location?: DoctorProfileLocationDto | null;

  @ApiProperty({ example: '2025-01-01T12:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2025-01-01T12:00:00.000Z' })
  updatedAt!: string;
}
