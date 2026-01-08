import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChatMessageDto } from './chat-message.dto';

class PageInfoDto {
  @ApiProperty({ example: true })
  hasNextPage!: boolean;

  @ApiPropertyOptional({
    example:
      'eyJjcmVhdGVkQXQiOiIyMDI1LTAxLTA1VDE0OjAwOjAwLjAwMFoiLCJpZCI6ImNtOWI3ZjM4Yy0wYzFlLTRjNWQtOGY5Zi0wYzBlNGM3ZTFhMWEifQ==',
    nullable: true,
  })
  endCursor?: string | null;
}

export class MessagesResponseDto {
  @ApiProperty({ type: [ChatMessageDto] })
  items!: ChatMessageDto[];

  @ApiProperty({ type: PageInfoDto })
  pageInfo!: PageInfoDto;
}
