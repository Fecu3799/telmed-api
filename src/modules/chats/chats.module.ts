import { Module } from '@nestjs/common';
import { ChatsController } from './chats.controller';
import { ChatsService } from './chats.service';
import { ChatsGateway } from './chats.gateway';
import { ChatRateLimitService } from './chat-rate-limit.service';

@Module({
  controllers: [ChatsController],
  providers: [ChatsService, ChatsGateway, ChatRateLimitService],
  exports: [ChatsService],
})
export class ChatsModule {}

