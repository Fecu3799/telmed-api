import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DoctorSearchLocationDto {
  @ApiProperty({ example: -34.6037 })
  lat!: number;

  @ApiProperty({ example: -58.3816 })
  lng!: number;
}

export class DoctorSearchSpecialtyDto {
  @ApiProperty({ example: 'b9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  id!: string;

  @ApiProperty({ example: 'Cardiologia' })
  name!: string;
}

export class DoctorSearchItemDto {
  @ApiProperty({ example: 'b9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  doctorUserId!: string;

  @ApiPropertyOptional({ example: 'Dr. Mario Perez' })
  displayName?: string | null;

  @ApiPropertyOptional({ example: 'Maria' })
  firstName?: string | null;

  @ApiPropertyOptional({ example: 'Gonzalez' })
  lastName?: string | null;

  @ApiProperty({ example: 150000 })
  priceCents!: number;

  @ApiProperty({ example: 'ARS' })
  currency!: string;

  @ApiProperty({ example: 'unverified' })
  verificationStatus!: string;

  @ApiPropertyOptional({ type: DoctorSearchLocationDto })
  location?: DoctorSearchLocationDto | null;

  @ApiPropertyOptional({ example: 1200 })
  distanceMeters?: number | null;

  @ApiPropertyOptional({ type: [DoctorSearchSpecialtyDto] })
  specialties?: DoctorSearchSpecialtyDto[];
}

export class DoctorSearchResponseDto {
  @ApiProperty({ type: [DoctorSearchItemDto] })
  items!: DoctorSearchItemDto[];

  @ApiProperty({
    example: { nextCursor: 'eyJzb3J0IjoicmVsZXZhbmNlIiwibGFzdElkIjoiLi4uIn0' },
  })
  pageInfo!: { nextCursor: string | null };

  @ApiProperty({ example: 50 })
  limit!: number;
}
