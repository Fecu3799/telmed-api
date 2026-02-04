import { ApiProperty } from '@nestjs/swagger';

export class DoctorSpecialtyDto {
  @ApiProperty({ example: 'b9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  id!: string;

  @ApiProperty({ example: 'Cardiologia' })
  name!: string;
}

export class DoctorSpecialtyOptionDto {
  @ApiProperty({ example: 'b9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  id!: string;

  @ApiProperty({ example: 'Cardiologia' })
  name!: string;

  @ApiProperty({ example: 'cardiologia' })
  slug!: string;

  @ApiProperty({ example: 1 })
  sortOrder!: number;

  @ApiProperty({ example: true })
  isActive!: boolean;
}

export class DoctorSpecialtiesResponseDto {
  @ApiProperty({ type: [DoctorSpecialtyDto] })
  specialties!: DoctorSpecialtyDto[];

  @ApiProperty({ type: [DoctorSpecialtyOptionDto] })
  all?: DoctorSpecialtyOptionDto[];

  @ApiProperty({ type: [String] })
  selectedIds?: string[];
}
