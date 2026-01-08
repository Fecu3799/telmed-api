import { ApiProperty } from '@nestjs/swagger';

export class PrepareUploadResponseDto {
  @ApiProperty({
    example: 'pf9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a',
    description: 'Patient file ID',
  })
  patientFileId!: string;

  @ApiProperty({
    example: 'f9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a',
    description: 'File object ID (use this in confirm)',
  })
  fileObjectId!: string;

  @ApiProperty({
    example: 'https://minio.local/presigned-upload-url',
    description: 'Presigned URL for uploading the file (PUT method)',
  })
  uploadUrl!: string;

  @ApiProperty({
    example: '2025-01-05T14:05:00.000Z',
    description: 'URL expiration time (ISO 8601)',
  })
  expiresAt!: string;
}
