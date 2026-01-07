import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { verify } from 'jsonwebtoken';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ChatsService } from './chats.service';
import { AuditService } from '../../infra/audit/audit.service';
import type { Actor } from '../../common/types/actor.type';
import { getTraceId } from '../../common/request-context';
import { ChatMessageKind } from '@prisma/client';

type JwtAccessPayload = { sub: string; role: string };

type ChatJoinPayload = { threadId: string };
type ChatSendPayload = {
  threadId: string;
  clientMessageId?: string;
  kind: 'text';
  text: string;
};

type AckResponse<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: { code: string; message: string } };

@WebSocketGateway({
  namespace: '/chats',
  cors: { origin: true, credentials: true },
})
export class ChatsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(ChatsGateway.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly chatsService: ChatsService,
    private readonly auditService: AuditService,
  ) {}

  handleConnection(client: Socket) {
    const actor = this.getActor(client);
    const origin = client.handshake.headers.origin ?? 'unknown';
    const namespace = client.nsp.name;
    const traceId = getTraceId() ?? null;
    this.logger.log(
      JSON.stringify({
        event: 'chat_ws_connection',
        socketId: client.id,
        namespace,
        userId: actor?.id ?? null,
        role: actor?.role ?? null,
        origin,
        traceId,
      }),
    );
  }

  handleDisconnect(client: Socket) {
    const actor = this.getActor(client);
    const namespace = client.nsp.name;
    const traceId = getTraceId() ?? null;
    this.logger.log(
      JSON.stringify({
        event: 'chat_ws_disconnection',
        socketId: client.id,
        namespace,
        userId: actor?.id ?? null,
        role: actor?.role ?? null,
        traceId,
      }),
    );
  }

  /**
   * Join a chat thread room
   * Client emits: chat:join { threadId }
   * Server joins socket to room: thread:{threadId}
   * ACK: { ok: true, threadId } or { ok: false, error: {...} }
   */
  @SubscribeMessage('chat:join')
  async handleChatJoin(
    client: Socket,
    payload: ChatJoinPayload,
    ack?: (resp: AckResponse<{ threadId: string }>) => void,
  ) {
    const actor = this.getActor(client);
    if (!actor) {
      return this.respondError(ack, 401, 'Unauthorized');
    }

    const traceId = getTraceId() ?? null;
    const room = this.threadRoomName(payload.threadId);

    this.logger.log(
      JSON.stringify({
        event: 'chat_join_request',
        socketId: client.id,
        threadId: payload.threadId,
        roomName: room,
        userId: actor.id,
        role: actor.role,
        namespace: client.nsp.name,
        traceId,
      }),
    );

    try {
      // Verify actor is part of thread
      const thread = await this.prisma.chatThread.findUnique({
        where: { id: payload.threadId },
      });

      if (!thread) {
        return this.respondError(ack, 404, 'Thread not found');
      }

      // Verify actor is doctor or patient in this thread
      if (
        (actor.role === 'doctor' && thread.doctorUserId !== actor.id) ||
        (actor.role === 'patient' && thread.patientUserId !== actor.id)
      ) {
        return this.respondError(ack, 403, 'Forbidden');
      }

      // Join room
      await client.join(room);

      this.logger.log(
        JSON.stringify({
          event: 'chat_join_success',
          socketId: client.id,
          threadId: payload.threadId,
          roomName: room,
          userId: actor.id,
          role: actor.role,
          traceId,
        }),
      );

      if (ack) {
        ack({ ok: true, data: { threadId: payload.threadId } });
      }
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'chat_join_error',
          socketId: client.id,
          threadId: payload.threadId,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          traceId,
        }),
      );
      return this.respondError(ack, 500, 'Internal server error');
    }
  }

  /**
   * Send a chat message
   * Client emits: chat:send { threadId, clientMessageId?, kind: "text", text }
   * Server:
   *   - Deduplicates by (threadId, senderUserId, clientMessageId)
   *   - Validates policy (for patient messages)
   *   - Persists message
   *   - Updates thread.lastMessageAt
   *   - Broadcasts chat:message to room
   * ACK: { ok: true, message: {...} } or { ok: false, error: {...} }
   */
  @SubscribeMessage('chat:send')
  async handleChatSend(
    client: Socket,
    payload: ChatSendPayload,
    ack?: (resp: AckResponse<{ message: any }>) => void,
  ) {
    const actor = this.getActor(client);
    if (!actor) {
      return this.respondError(ack, 401, 'Unauthorized');
    }

    const traceId = getTraceId() ?? null;

    this.logger.log(
      JSON.stringify({
        event: 'chat_send_request',
        socketId: client.id,
        threadId: payload.threadId,
        clientMessageId: payload.clientMessageId ?? null,
        userId: actor.id,
        role: actor.role,
        namespace: client.nsp.name,
        traceId,
      }),
    );

    try {
      // Validate payload
      if (!payload.threadId || !payload.text) {
        return this.respondError(
          ack,
          422,
          'Invalid argument: threadId and text required',
        );
      }

      if (payload.kind !== 'text') {
        return this.respondError(
          ack,
          422,
          'Invalid argument: only kind="text" is supported',
        );
      }

      // Create message (includes deduplication, policy checks, etc.)
      const message = await this.chatsService.createMessage(
        actor,
        payload.threadId,
        ChatMessageKind.text,
        payload.text,
        payload.clientMessageId ?? null,
        traceId,
      );

      // Broadcast to room (only if message is new, not deduplicated)
      // Note: If message was deduplicated, it already exists, so we still broadcast it
      const room = this.threadRoomName(payload.threadId);
      this.server.to(room).emit('chat:message', {
        message: {
          id: message.id,
          threadId: message.threadId,
          senderUserId: message.senderUserId,
          senderRole: message.senderRole,
          kind: message.kind,
          text: message.text,
          clientMessageId: message.clientMessageId,
          contextConsultationId: message.contextConsultationId,
          createdAt: message.createdAt.toISOString(),
          sender: {
            id: (message as any).sender?.id,
            email: (message as any).sender?.email,
            displayName: (message as any).sender?.displayName,
          },
        },
      });

      this.logger.log(
        JSON.stringify({
          event: 'chat_send_success',
          socketId: client.id,
          threadId: payload.threadId,
          messageId: message.id,
          clientMessageId: payload.clientMessageId ?? null,
          userId: actor.id,
          role: actor.role,
          traceId,
        }),
      );

      if (ack) {
        ack({
          ok: true,
          data: {
            message: {
              id: message.id,
              threadId: message.threadId,
              senderUserId: message.senderUserId,
              senderRole: message.senderRole,
              kind: message.kind,
              text: message.text,
              clientMessageId: message.clientMessageId,
              contextConsultationId: message.contextConsultationId,
              createdAt: message.createdAt.toISOString(),
            },
          },
        });
      }
    } catch (error: any) {
      this.logger.error(
        JSON.stringify({
          event: 'chat_send_error',
          socketId: client.id,
          threadId: payload.threadId,
          error: error?.message ?? String(error),
          stack: error instanceof Error ? error.stack : undefined,
          traceId,
        }),
      );

      // Handle ConflictException with error code
      if (error?.status === 409 && error?.response?.extensions?.code) {
        return this.respondError(
          ack,
          409,
          error.response.message || 'Cannot send message',
          error.response.extensions.code,
        );
      }

      // Handle other HTTP exceptions
      const status = error?.status ?? 500;
      const message = error?.message ?? 'Internal server error';
      return this.respondError(ack, status, message);
    }
  }

  private threadRoomName(threadId: string): string {
    return `thread:${threadId}`;
  }

  private getActor(client: Socket): Actor | null {
    const existing = client.data.actor as Actor | undefined;
    if (existing) {
      return existing;
    }

    const authHeader = client.handshake.headers.authorization;
    const tokenFromHeader =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : null;
    const authToken =
      (client.handshake.auth as { token?: string } | undefined)?.token ??
      tokenFromHeader;
    const rawToken =
      typeof authToken === 'string' && authToken.startsWith('Bearer ')
        ? authToken.slice(7)
        : authToken;

    if (!rawToken) {
      return null;
    }

    try {
      const secret = this.configService.getOrThrow<string>('JWT_ACCESS_SECRET');
      const payload = verify(rawToken, secret) as JwtAccessPayload;
      const actor: Actor = { id: payload.sub, role: payload.role as any };
      client.data.actor = actor;
      return actor;
    } catch {
      return null;
    }
  }

  private respondError<T>(
    ack: ((resp: AckResponse<T>) => void) | undefined,
    status: number,
    message: string,
    code?: string,
  ) {
    if (ack) {
      ack({
        ok: false,
        error: {
          code: code ?? this.statusToCode(status),
          message,
        },
      });
    }
  }

  private statusToCode(status: number): string {
    switch (status) {
      case 401:
        return 'UNAUTHORIZED';
      case 403:
        return 'FORBIDDEN';
      case 404:
        return 'NOT_FOUND';
      case 409:
        return 'CONFLICT';
      case 422:
        return 'INVALID_ARGUMENT';
      default:
        return 'INTERNAL_ERROR';
    }
  }
}
