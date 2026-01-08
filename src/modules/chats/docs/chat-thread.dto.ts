import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChatPolicyDto } from './chat-policy.dto';
import { ChatUserDto } from './chat-user.dto';

export class ChatThreadDto {
  @ApiProperty({ example: 'ct9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  id!: string;

  @ApiProperty({ example: 'd9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  doctorUserId!: string;

  @ApiProperty({ example: 'p9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  patientUserId!: string;

  @ApiPropertyOptional({ example: '2025-01-05T14:00:00.000Z', nullable: true })
  lastMessageAt?: string | null;

  @ApiProperty({ example: '2025-01-05T13:50:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2025-01-05T13:55:00.000Z' })
  updatedAt!: string;

  @ApiProperty({ type: ChatPolicyDto })
  policy!: ChatPolicyDto;

  @ApiProperty({ type: ChatUserDto })
  doctor!: ChatUserDto;

  @ApiProperty({ type: ChatUserDto })
  patient!: ChatUserDto;
}
