import { ApiProperty } from '@nestjs/swagger';
import { SpecialtyDto } from './specialty.dto';

export class AdminSpecialtiesPageInfoDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;

  @ApiProperty({ example: 5 })
  totalItems!: number;

  @ApiProperty({ example: 1 })
  totalPages!: number;

  @ApiProperty({ example: false })
  hasNextPage!: boolean;

  @ApiProperty({ example: false })
  hasPrevPage!: boolean;
}

export class AdminSpecialtiesListDto {
  @ApiProperty({ type: [SpecialtyDto] })
  items!: SpecialtyDto[];

  @ApiProperty({ type: AdminSpecialtiesPageInfoDto })
  pageInfo!: AdminSpecialtiesPageInfoDto;
}
