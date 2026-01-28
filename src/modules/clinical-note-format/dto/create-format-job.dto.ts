import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsObject, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Format job creation options.
 * What it does:
 * - Defines optional formatting preferences for clinical note generation.
 * How it works:
 * - Used to customize the style and structure of generated proposals.
 * Gotchas:
 * - All fields are optional; defaults are applied in the service.
 */
class FormatJobOptionsDto {
  @ApiPropertyOptional({ example: 'medium', enum: ['short', 'medium', 'long'] })
  @IsOptional()
  @IsEnum(['short', 'medium', 'long'])
  length?: 'short' | 'medium' | 'long';

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  bullets?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  keywords?: boolean;

  @ApiPropertyOptional({ example: 'clinical', enum: ['clinical', 'mixed'] })
  @IsOptional()
  @IsEnum(['clinical', 'mixed'])
  tone?: 'clinical' | 'mixed';
}

/**
 * Create format job request.
 * What it does:
 * - Request body for creating a new format job for a clinical note.
 * How it works:
 * - Validates preset and options, then creates/retrieves a job in the queue.
 * Gotchas:
 * - Requires final note to exist; returns existing job if inputHash matches.
 */
export class CreateFormatJobDto {
  @ApiPropertyOptional({
    example: 'standard',
    enum: ['standard', 'brief', 'detailed'],
  })
  @IsOptional()
  @IsEnum(['standard', 'brief', 'detailed'])
  preset?: 'standard' | 'brief' | 'detailed';

  @ApiPropertyOptional({ type: FormatJobOptionsDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => FormatJobOptionsDto)
  options?: FormatJobOptionsDto;
}
