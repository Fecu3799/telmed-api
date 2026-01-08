import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class ConfirmUploadDto {
  @ApiProperty({
    example: 'f9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a',
    description: 'FileObject ID (must match the one from prepare)',
  })
  @IsUUID()
  fileObjectId!: string;

  @ApiPropertyOptional({
    example: 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
    description:
      'SHA-256 checksum (64 hex characters). Must match if provided in prepare.',
  })
  @IsOptional()
  @IsString()
  sha256?: string;
}
