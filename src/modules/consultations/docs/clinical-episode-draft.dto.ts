import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ClinicalEpisodeDraftDto {
  @ApiProperty({ example: 'a9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  id!: string;

  @ApiProperty({ example: 'Draft summary' })
  title!: string;

  @ApiProperty({ example: 'Draft clinical notes' })
  body!: string;

  @ApiProperty({ example: '2025-01-05T13:55:00.000Z' })
  updatedAt!: string;
}

export class ClinicalEpisodeDraftResponseDto {
  @ApiProperty({ example: 'a9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  episodeId!: string;

  @ApiProperty({ example: 'a9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  consultationId!: string;

  @ApiProperty({ type: ClinicalEpisodeDraftDto })
  draft!: ClinicalEpisodeDraftDto;
}

export class ClinicalEpisodeFinalDto {
  @ApiProperty({ example: 'a9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  id!: string;

  @ApiProperty({ example: 'Final summary' })
  title!: string;

  @ApiPropertyOptional({ example: 'Final clinical notes' })
  body?: string;

  @ApiPropertyOptional({ example: 'Formatted clinical notes' })
  formattedBody?: string | null;

  @ApiPropertyOptional({ example: '2025-01-05T13:55:00.000Z' })
  formattedAt?: string | null;

  @ApiProperty({ example: 'Formatted clinical notes' })
  displayBody!: string;

  @ApiProperty({ example: '2025-01-05T13:55:00.000Z' })
  createdAt!: string;
}

export class ClinicalEpisodeResponseDto {
  @ApiProperty({ example: 'a9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  episodeId!: string;

  @ApiProperty({ example: 'a9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  consultationId!: string;

  @ApiPropertyOptional({ type: ClinicalEpisodeDraftDto })
  draft?: ClinicalEpisodeDraftDto;

  @ApiPropertyOptional({ type: ClinicalEpisodeFinalDto })
  final?: ClinicalEpisodeFinalDto;
}
