import { ApiProperty } from '@nestjs/swagger';
import { ConsultationMessageDto } from './consultation-message.dto';

class ConsultationMessagesPageInfoDto {
  @ApiProperty({
    example:
      'eyJjcmVhdGVkQXQiOiIyMDI1LTAxLTA1VDE0OjAwOjAwLjAwMFoiLCJpZCI6Im0xIn0',
    nullable: true,
  })
  nextCursor!: string | null;
}

export class ConsultationMessagesResponseDto {
  @ApiProperty({ type: [ConsultationMessageDto] })
  items!: ConsultationMessageDto[];

  @ApiProperty({ type: ConsultationMessagesPageInfoDto })
  pageInfo!: ConsultationMessagesPageInfoDto;
}
