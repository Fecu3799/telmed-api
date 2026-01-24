import { ApiProperty } from '@nestjs/swagger';
import { ClinicalMedicationDto } from './clinical-medication.dto';

class ClinicalMedicationsPageInfoDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: true })
  hasNextPage!: boolean;

  @ApiProperty({ example: false })
  hasPrevPage!: boolean;
}

export class ClinicalMedicationsResponseDto {
  @ApiProperty({ type: [ClinicalMedicationDto] })
  items!: ClinicalMedicationDto[];

  @ApiProperty({ type: ClinicalMedicationsPageInfoDto })
  pageInfo!: ClinicalMedicationsPageInfoDto;
}
