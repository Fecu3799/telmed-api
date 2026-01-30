import { ApiProperty } from '@nestjs/swagger';

export class SpecialtyDto {
  @ApiProperty({ example: 'b9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  id!: string;

  @ApiProperty({ example: 'Cardiologia' })
  name!: string;

  @ApiProperty({ example: 'cardiologia' })
  slug!: string;

  @ApiProperty({ example: 0 })
  sortOrder!: number;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: '2025-01-01T00:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2025-01-01T00:00:00.000Z' })
  updatedAt!: string;

  @ApiProperty({ example: null, nullable: true })
  deactivatedAt?: string | null;
}
