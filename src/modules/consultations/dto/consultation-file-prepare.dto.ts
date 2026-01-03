import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ConsultationFilePrepareDto {
  @ApiProperty({ example: 'informe.pdf' })
  @IsString()
  filename!: string;

  @ApiProperty({ example: 'application/pdf' })
  @IsString()
  mimeType!: string;

  @ApiProperty({ example: 24576, minimum: 1 })
  @IsInt()
  @Min(1)
  sizeBytes!: number;

  @ApiProperty({
    example: 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
    required: false,
  })
  @IsOptional()
  @IsString()
  sha256?: string;
}
