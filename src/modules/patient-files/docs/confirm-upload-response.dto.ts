import { ApiProperty } from '@nestjs/swagger';

export class ConfirmUploadResponseDto {
  @ApiProperty({
    example: 'pf9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a',
    description: 'Patient file ID',
  })
  patientFileId!: string;
}
