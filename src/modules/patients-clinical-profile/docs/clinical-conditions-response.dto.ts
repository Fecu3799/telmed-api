import { ApiProperty } from '@nestjs/swagger';
import { ClinicalConditionDto } from './clinical-condition.dto';

class ClinicalConditionsPageInfoDto {
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

export class ClinicalConditionsResponseDto {
  @ApiProperty({ type: [ClinicalConditionDto] })
  items!: ClinicalConditionDto[];

  @ApiProperty({ type: ClinicalConditionsPageInfoDto })
  pageInfo!: ClinicalConditionsPageInfoDto;
}
