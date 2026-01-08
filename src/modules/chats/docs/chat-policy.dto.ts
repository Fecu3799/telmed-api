import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChatPolicyDto {
  @ApiProperty({ example: 'cp9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  id!: string;

  @ApiProperty({ example: 'ct9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  threadId!: string;

  @ApiProperty({ example: true })
  patientCanMessage!: boolean;

  @ApiPropertyOptional({ example: 10, nullable: true })
  dailyLimit?: number | null;

  @ApiPropertyOptional({ example: 3, nullable: true })
  burstLimit?: number | null;

  @ApiPropertyOptional({ example: 30, nullable: true })
  burstWindowSeconds?: number | null;

  @ApiProperty({ example: true })
  requireRecentConsultation!: boolean;

  @ApiPropertyOptional({ example: 72, nullable: true })
  recentConsultationWindowHours?: number | null;

  @ApiProperty({ example: false })
  closedByDoctor!: boolean;

  @ApiProperty({ example: '2025-01-05T13:50:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2025-01-05T13:55:00.000Z' })
  updatedAt!: string;
}
