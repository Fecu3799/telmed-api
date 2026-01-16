import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ActiveConsultationDataDto {
  @ApiProperty({ example: 'c9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  consultationId!: string;

  @ApiPropertyOptional({ example: 'e9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  queueItemId?: string | null;

  @ApiPropertyOptional({ example: 'a9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  appointmentId?: string | null;

  @ApiProperty({ example: 'in_progress' })
  status!: string;
}

export class ActiveConsultationResponseDto {
  @ApiPropertyOptional({ type: ActiveConsultationDataDto })
  consultation?: ActiveConsultationDataDto | null;
}
