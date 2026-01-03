import { ApiProperty } from '@nestjs/swagger';

export class ConsultationFilePrepareResponseDto {
  @ApiProperty({ example: 'f9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  fileId!: string;

  @ApiProperty({ example: 'https://minio.local/presigned-upload-url' })
  uploadUrl!: string;

  @ApiProperty({ example: 'telmed' })
  bucket!: string;

  @ApiProperty({
    example:
      'consultations/c9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a/f9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a/informe.pdf',
  })
  objectKey!: string;
}

export class ConsultationFileDownloadDto {
  @ApiProperty({ example: 'https://minio.local/presigned-download-url' })
  downloadUrl!: string;
}
