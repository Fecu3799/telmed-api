import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ProblemDetailsDto } from '../../common/docs/problem-details.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { Actor } from '../../common/types/actor.type';
import { ChatsService } from './chats.service';
import { MessagesQueryDto } from './dto/messages-query.dto';
import { UpdatePolicyDto } from './dto/update-policy.dto';

@ApiTags('chats')
@Controller('chats')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ type: ProblemDetailsDto })
@ApiForbiddenResponse({ type: ProblemDetailsDto })
export class ChatsController {
  constructor(private readonly chatsService: ChatsService) {}

  @Get('threads/with/:otherUserId')
  @ApiOperation({ summary: 'Get or create thread with another user' })
  @ApiOkResponse()
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  async getOrCreateThread(
    @CurrentUser() actor: Actor,
    @Param('otherUserId') otherUserId: string,
    @Req() req: Request,
  ) {
    return this.chatsService.getOrCreateThread(
      actor,
      otherUserId,
      (req as Request & { traceId?: string }).traceId ?? null,
    );
  }

  @Get('threads')
  @ApiOperation({ summary: 'List chat threads for current user' })
  @ApiOkResponse()
  async listThreads(@CurrentUser() actor: Actor, @Req() req: Request) {
    return this.chatsService.listThreads(
      actor,
      (req as Request & { traceId?: string }).traceId ?? null,
    );
  }

  @Get('threads/:threadId/messages')
  @ApiOperation({ summary: 'List messages in a thread' })
  @ApiOkResponse()
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async getMessages(
    @CurrentUser() actor: Actor,
    @Param('threadId') threadId: string,
    @Query() query: MessagesQueryDto,
    @Req() req: Request,
  ) {
    return this.chatsService.getMessages(
      actor,
      threadId,
      query.cursor,
      query.limit,
      (req as Request & { traceId?: string }).traceId ?? null,
    );
  }

  @Patch('threads/:threadId/policy')
  @ApiOperation({ summary: 'Update thread policy (doctor only)' })
  @ApiOkResponse()
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async updatePolicy(
    @CurrentUser() actor: Actor,
    @Param('threadId') threadId: string,
    @Body() dto: UpdatePolicyDto,
    @Req() req: Request,
  ) {
    return this.chatsService.updatePolicy(
      actor,
      threadId,
      dto,
      (req as Request & { traceId?: string }).traceId ?? null,
    );
  }
}
