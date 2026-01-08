import { ApiProperty } from '@nestjs/swagger';

export class DownloadResponseDto {
  @ApiProperty({
    example: 'https://minio.local/presigned-download-url',
    description: 'Presigned URL for downloading the file (GET method)',
  })
  downloadUrl!: string;

  @ApiProperty({
    example: '2025-01-05T14:05:00.000Z',
    description: 'URL expiration time (ISO 8601)',
  })
  expiresAt!: string;
}
