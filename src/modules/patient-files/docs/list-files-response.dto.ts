import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PatientFileDto } from './patient-file.dto';

class PageInfoDto {
  @ApiProperty({ example: true })
  hasNextPage!: boolean;

  @ApiPropertyOptional({
    example:
      'eyJjcmVhdGVkQXQiOiIyMDI1LTAxLTA1VDE0OjAwOjAwLjAwMFoiLCJpZCI6ImNtOWI3ZjM4Yy0wYzFlLTRjNWQtOGY5Zi0wYzBlNGM3ZTFhMWEifQ==',
    nullable: true,
  })
  endCursor?: string | null;
}

export class ListFilesResponseDto {
  @ApiProperty({ type: [PatientFileDto] })
  items!: PatientFileDto[];

  @ApiProperty({ type: PageInfoDto })
  pageInfo!: PageInfoDto;
}
