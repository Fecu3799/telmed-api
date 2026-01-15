import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class GeoNearbySpecialtyDto {
  @ApiProperty({ example: 'b9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  id!: string;

  @ApiProperty({ example: 'Cardiologia' })
  name!: string;
}

export class GeoNearbyDoctorDto {
  @ApiProperty({ example: 'b9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  doctorUserId!: string;

  @ApiPropertyOptional({ example: 'Dra. Ana Perez' })
  displayName?: string | null;

  @ApiPropertyOptional({ example: 'Ana' })
  firstName?: string | null;

  @ApiPropertyOptional({ example: 'Perez' })
  lastName?: string | null;

  @ApiProperty({ example: 150000 })
  priceCents!: number;

  @ApiProperty({ example: 'ARS' })
  currency!: string;

  @ApiProperty({ example: 'unverified' })
  verificationStatus!: string;

  @ApiProperty({ example: 1200 })
  distanceMeters!: number;

  @ApiPropertyOptional({ example: 'Buenos Aires' })
  city?: string | null;

  @ApiPropertyOptional({ example: 'Buenos Aires' })
  region?: string | null;

  @ApiPropertyOptional({ example: 'AR' })
  countryCode?: string | null;

  @ApiProperty({ type: [GeoNearbySpecialtyDto] })
  specialties!: GeoNearbySpecialtyDto[];
}

class GeoNearbyPageInfoDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;

  @ApiProperty({ example: false })
  hasNextPage!: boolean;

  @ApiProperty({ example: false })
  hasPrevPage!: boolean;
}

export class GeoNearbyResponseDto {
  @ApiProperty({ type: [GeoNearbyDoctorDto] })
  items!: GeoNearbyDoctorDto[];

  @ApiProperty({ type: GeoNearbyPageInfoDto })
  pageInfo!: GeoNearbyPageInfoDto;
}
