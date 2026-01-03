import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ConsultationFileConfirmDto {
  @ApiProperty({ example: 'f9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  @IsString()
  fileId!: string;
}
