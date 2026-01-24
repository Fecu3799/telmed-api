import { ApiProperty } from '@nestjs/swagger';
import { ClinicalAllergyDto } from './clinical-allergy.dto';

class ClinicalAllergiesPageInfoDto {
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

export class ClinicalAllergiesResponseDto {
  @ApiProperty({ type: [ClinicalAllergyDto] })
  items!: ClinicalAllergyDto[];

  @ApiProperty({ type: ClinicalAllergiesPageInfoDto })
  pageInfo!: ClinicalAllergiesPageInfoDto;
}
