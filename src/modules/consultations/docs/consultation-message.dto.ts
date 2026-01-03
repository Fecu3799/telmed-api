import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConsultationMessageKind } from '@prisma/client';

export class ConsultationMessageFileDto {
  @ApiProperty({ example: 'f9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  id!: string;

  @ApiProperty({ example: 'application/pdf' })
  mimeType!: string;

  @ApiProperty({ example: 24576 })
  sizeBytes!: number;
}

export class ConsultationMessageDto {
  @ApiProperty({ example: 'm9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  id!: string;

  @ApiProperty({ example: 'c9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  consultationId!: string;

  @ApiProperty({ example: '2b3c5f7a-9c2a-4c1e-8e9f-123456789abc' })
  senderUserId!: string;

  @ApiProperty({ example: 'text', enum: ConsultationMessageKind })
  kind!: ConsultationMessageKind;

  @ApiPropertyOptional({ example: 'Hola doctor' })
  text?: string | null;

  @ApiPropertyOptional({ type: ConsultationMessageFileDto, nullable: true })
  file?: ConsultationMessageFileDto | null;

  @ApiPropertyOptional({ example: '2025-01-05T14:01:00.000Z' })
  deliveredAt?: string | null;

  @ApiProperty({ example: '2025-01-05T14:00:00.000Z' })
  createdAt!: string;
}
