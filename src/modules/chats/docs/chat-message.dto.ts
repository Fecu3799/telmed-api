import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChatUserDto } from './chat-user.dto';

export class ChatMessageDto {
  @ApiProperty({ example: 'cm9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  id!: string;

  @ApiProperty({ example: 'ct9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  threadId!: string;

  @ApiProperty({ example: 'u9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  senderUserId!: string;

  @ApiProperty({ example: 'doctor', enum: ['doctor', 'patient'] })
  senderRole!: 'doctor' | 'patient';

  @ApiProperty({ example: 'text', enum: ['text'] })
  kind!: 'text';

  @ApiProperty({ example: 'Hello, how are you?' })
  text!: string;

  @ApiPropertyOptional({
    example: 'cmi9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a',
    nullable: true,
  })
  clientMessageId?: string | null;

  @ApiPropertyOptional({
    example: 'c9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a',
    nullable: true,
  })
  contextConsultationId?: string | null;

  @ApiProperty({ example: '2025-01-05T14:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ type: ChatUserDto })
  sender!: ChatUserDto;
}
