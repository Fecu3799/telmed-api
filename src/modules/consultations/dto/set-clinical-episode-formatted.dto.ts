import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class SetClinicalEpisodeFormattedDto {
  @ApiProperty({ example: 'Formatted clinical notes' })
  @IsString()
  formattedBody!: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  formatVersion?: number;

  @ApiPropertyOptional({
    example: { model: 'gpt-4o', promptVersion: 'v1' },
  })
  @IsOptional()
  aiMeta?: Record<string, unknown>;
}
