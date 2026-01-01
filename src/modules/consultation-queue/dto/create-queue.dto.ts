import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateQueueDto {
  @ApiPropertyOptional({ example: 'e9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  @IsOptional()
  @IsUUID()
  appointmentId?: string;

  @ApiProperty({ example: 'd9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  @IsUUID()
  doctorUserId!: string;

  @ApiPropertyOptional({ example: '2b3c5f7a-9c2a-4c1e-8e9f-123456789abc' })
  @IsOptional()
  @IsUUID()
  patientUserId?: string;

  @ApiPropertyOptional({
    example: 'Dolor agudo en el pecho',
    description: 'Requerido si no se envía appointmentId (emergency).',
  })
  @ValidateIf((dto) => !dto.appointmentId)
  @IsString()
  @MinLength(2)
  reason?: string;
}
