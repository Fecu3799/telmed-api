import { ApiProperty } from '@nestjs/swagger';
import { ClinicalProcedureDto } from './clinical-procedure.dto';

class ClinicalProceduresPageInfoDto {
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

export class ClinicalProceduresResponseDto {
  @ApiProperty({ type: [ClinicalProcedureDto] })
  items!: ClinicalProcedureDto[];

  @ApiProperty({ type: ClinicalProceduresPageInfoDto })
  pageInfo!: ClinicalProceduresPageInfoDto;
}
