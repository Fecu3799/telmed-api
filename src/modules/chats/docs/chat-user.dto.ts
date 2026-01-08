import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChatUserDto {
  @ApiProperty({ example: 'u9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  id!: string;

  @ApiProperty({ example: 'user@example.com' })
  email!: string;

  @ApiPropertyOptional({ example: 'John Doe', nullable: true })
  displayName?: string | null;
}
