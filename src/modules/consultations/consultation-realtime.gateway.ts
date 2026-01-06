import {
  HttpException,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { verify } from 'jsonwebtoken';
import { ConsultationStatus, UserRole } from '@prisma/client';
import type { JwtAccessPayload } from '../auth/auth.types';
import type { Actor } from '../../common/types/actor.type';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ConsultationRealtimeService } from './consultation-realtime.service';
import { ConsultationAccessService } from './consultation-access.service';
import { ConsultationQueueAccessService } from '../consultation-queue/consultation-queue-access.service';
import { RedisService } from '../../infra/redis/redis.service';
import { AuditService } from '../../infra/audit/audit.service';
import { AuditAction } from '@prisma/client';
import { getTraceId } from '../../common/request-context';

type JoinPayload = { consultationId: string };
type QueueSubscribePayload = { queueItemId: string };
type PingPayload = { consultationId: string };
type ChatSendPayload = {
  consultationId: string;
  clientMsgId?: string;
  text: string;
};
type ChatDeliveredPayload = { consultationId: string; messageId: string };

/**
 * WebSocket Gateway for consultations namespace
 * Handles real-time events: consultation join, presence, chat, file sharing
 *
 * TODO: For production scalability with multiple server instances,
 * consider using socket.io-redis-adapter to enable cross-server room communication.
 * This would require:
 * - Install @socket.io/redis-adapter
 * - Configure Redis adapter in main.ts or gateway initialization
 * - Ensure Redis is accessible from all server instances
 */
@WebSocketGateway({
  namespace: '/consultations',
  cors: { origin: true, credentials: true },
})
export class ConsultationRealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(ConsultationRealtimeGateway.name);
  private readonly presenceTtlSeconds = 30;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly realtimeService: ConsultationRealtimeService,
    private readonly accessService: ConsultationAccessService,
    private readonly queueAccessService: ConsultationQueueAccessService,
    private readonly redisService: RedisService,
    private readonly auditService: AuditService,
  ) {}

  // Observability: log connection events
  handleConnection(client: Socket) {
    const actor = this.getActor(client);
    const origin = client.handshake.headers.origin ?? 'unknown';
    this.logger.log(
      JSON.stringify({
        event: 'ws_connection',
        socketId: client.id,
        userId: actor?.id ?? null,
        role: actor?.role ?? null,
        origin,
      }),
    );
  }

  handleDisconnect(client: Socket) {
    const actor = this.getActor(client);
    this.logger.log(
      JSON.stringify({
        event: 'ws_disconnection',
        socketId: client.id,
        userId: actor?.id ?? null,
        role: actor?.role ?? null,
      }),
    );
  }

  /**
   * Subscribe to queue item updates (patient waiting for doctor to start)
   * Client emits: queue.subscribe { queueItemId }
   * Server joins socket to room: queue:{queueItemId}
   * Server emits consultation.started when doctor starts the consultation
   */
  @SubscribeMessage('queue.subscribe')
  async handleQueueSubscribe(
    client: Socket,
    payload: QueueSubscribePayload,
    ack?: (resp: unknown) => void,
  ) {
    const actor = this.getActor(client);
    if (!actor) {
      return this.respondError(ack, client, 401, 'Unauthorized');
    }

    try {
      // Validate actor has access to this queue item
      const queue = await this.queueAccessService.canAccess(
        actor,
        payload.queueItemId,
      );

      // Join socket to queue room for event notifications
      const room = this.queueRoomName(payload.queueItemId);
      await client.join(room);

      // Observability: log subscription
      this.logger.log(
        JSON.stringify({
          event: 'queue_subscribe',
          socketId: client.id,
          queueItemId: payload.queueItemId,
          userId: actor.id,
          role: actor.role,
          traceId: getTraceId() ?? null,
        }),
      );

      return this.respondOk(ack, {
        ok: true,
        subscribed: true,
        queueItemId: payload.queueItemId,
      });
    } catch (error) {
      // If auth/permission fails, emit error response
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof HttpException
      ) {
        return this.respondException(ack, client, error);
      }
      // For other errors, disconnect for security
      this.logger.warn(
        JSON.stringify({
          event: 'queue_subscribe_error',
          socketId: client.id,
          queueItemId: payload.queueItemId,
          error: String(error),
        }),
      );
      client.disconnect();
      return this.respondError(ack, client, 500, 'Internal error');
    }
  }

  @SubscribeMessage('consultation.join')
  async handleJoin(
    client: Socket,
    payload: JoinPayload,
    ack?: (resp: unknown) => void,
  ) {
    const actor = this.getActor(client);
    if (!actor) {
      return this.respondError(ack, client, 401, 'Unauthorized');
    }

    try {
      // Use reusable access service for authorization
      const consultation = await this.accessService.canAccess(
        actor,
        payload.consultationId,
      );

      // Allow join even if consultation is not in_progress yet
      // This enables patients to wait for doctor to start the consultation
      const room = this.roomName(payload.consultationId);
      await client.join(room);

      // Only set presence if consultation is in_progress
      if (consultation.status === ConsultationStatus.in_progress) {
        await this.setPresence(payload.consultationId, actor.id);

        const presence = await this.getPresence(payload.consultationId);
        this.server.to(room).emit('presence.state', {
          consultationId: payload.consultationId,
          onlineUserIds: presence,
        });
      }

      await this.auditService.log({
        action: AuditAction.READ,
        resourceType: 'Consultation',
        resourceId: consultation.id,
        actor,
        traceId: getTraceId() ?? null,
        metadata: { event: 'ws_join' },
      });

      return this.respondOk(ack, {
        ok: true,
        serverTime: new Date().toISOString(),
        consultationStatus: consultation.status,
      });
    } catch (error) {
      return this.respondException(ack, client, error);
    }
  }

  @SubscribeMessage('presence.ping')
  async handlePing(
    client: Socket,
    payload: PingPayload,
    ack?: (resp: unknown) => void,
  ) {
    const actor = this.getActor(client);
    if (!actor) {
      return this.respondError(ack, client, 401, 'Unauthorized');
    }

    try {
      await this.getConsultationForParticipant(actor, payload.consultationId);
      await this.setPresence(payload.consultationId, actor.id);

      const presence = await this.getPresence(payload.consultationId);
      this.server
        .to(this.roomName(payload.consultationId))
        .emit('presence.state', {
          consultationId: payload.consultationId,
          onlineUserIds: presence,
        });

      return this.respondOk(ack, { ok: true });
    } catch (error) {
      return this.respondException(ack, client, error);
    }
  }

  @SubscribeMessage('chat.send')
  async handleChatSend(
    client: Socket,
    payload: ChatSendPayload,
    ack?: (resp: unknown) => void,
  ) {
    const actor = this.getActor(client);
    if (!actor) {
      return this.respondError(ack, client, 401, 'Unauthorized');
    }

    try {
      const message = await this.realtimeService.createTextMessage(
        actor,
        payload.consultationId,
        payload.text,
      );
      const response = {
        ok: true,
        clientMsgId: payload.clientMsgId ?? null,
        message,
      };

      this.server
        .to(this.roomName(payload.consultationId))
        .emit('chat.message_created', { message });

      return this.respondOk(ack, response);
    } catch (error) {
      return this.respondException(ack, client, error);
    }
  }

  @SubscribeMessage('chat.delivered')
  async handleDelivered(
    client: Socket,
    payload: ChatDeliveredPayload,
    ack?: (resp: unknown) => void,
  ) {
    const actor = this.getActor(client);
    if (!actor) {
      return this.respondError(ack, client, 401, 'Unauthorized');
    }

    try {
      const message = await this.realtimeService.markMessageDelivered(
        actor,
        payload.consultationId,
        payload.messageId,
      );

      this.server
        .to(this.roomName(payload.consultationId))
        .emit('chat.message_delivered', {
          messageId: message.id,
          deliveredAt: message.deliveredAt,
        });

      return this.respondOk(ack, { ok: true });
    } catch (error) {
      return this.respondException(ack, client, error);
    }
  }

  /**
   * Emit consultation.started event to queue room when doctor starts consultation.
   * Called when a consultation transitions to in_progress (e.g., doctor starts from queue).
   * @param queueItemId - The queue item ID (to emit to queue:{queueItemId} room)
   * @param consultationId - The consultation ID
   * @param roomName - Room name for LiveKit (e.g., consultation_<id>)
   * @param livekitUrl - LiveKit server URL
   * @param startedAt - When the consultation started
   * @param traceId - Optional trace ID for observability
   */
  emitConsultationStarted(
    queueItemId: string,
    consultationId: string,
    roomName: string,
    livekitUrl: string,
    startedAt: Date,
    traceId?: string | null,
  ) {
    const payload = {
      queueItemId,
      consultationId,
      roomName,
      livekitUrl,
      startedAt: startedAt.toISOString(),
    };

    // Emit to queue room (where patient is subscribed)
    const queueRoom = this.queueRoomName(queueItemId);
    const recipients = this.server.sockets.adapter.rooms.get(queueRoom);
    const recipientsCount = recipients?.size ?? 0;

    this.server.to(queueRoom).emit('consultation.started', payload);

    // Also emit to consultation room for consistency
    const consultationRoom = this.roomName(consultationId);
    this.server.to(consultationRoom).emit('consultation.started', payload);

    // Observability: log with recipients count
    this.logger.log(
      JSON.stringify({
        event: 'consultation_started_emitted',
        queueItemId,
        consultationId,
        roomName,
        livekitUrl,
        startedAt: startedAt.toISOString(),
        queueRoom,
        consultationRoom,
        recipientsCount,
        traceId: traceId ?? null,
      }),
    );
  }

  emitConsultationClosed(consultationId: string, closedAt: Date) {
    this.server.to(this.roomName(consultationId)).emit('consultation.closed', {
      consultationId,
      closedAt: closedAt.toISOString(),
    });
  }

  emitMessageCreated(consultationId: string, message: unknown) {
    this.server
      .to(this.roomName(consultationId))
      .emit('chat.message_created', { message });
  }

  private roomName(consultationId: string) {
    return `consultation:${consultationId}`;
  }

  private queueRoomName(queueItemId: string) {
    return `queue:${queueItemId}`;
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
      const actor: Actor = { id: payload.sub, role: payload.role };
      client.data.actor = actor;
      return actor;
    } catch {
      return null;
    }
  }

  // Deprecated: Use ConsultationAccessService.canAccess() instead
  // Kept for backward compatibility with presence.ping handler
  private async getConsultationForParticipant(
    actor: Actor,
    consultationId: string,
  ) {
    return this.accessService.canAccess(actor, consultationId);
  }

  private async setPresence(consultationId: string, userId: string) {
    const redis = this.redisService.getClient();
    const key = `presence:consultation:${consultationId}:${userId}`;
    await redis.set(key, '1', 'EX', this.presenceTtlSeconds);
  }

  private async getPresence(consultationId: string) {
    const redis = this.redisService.getClient();
    const pattern = `presence:consultation:${consultationId}:*`;
    const onlineUserIds: string[] = [];
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = nextCursor;
      for (const key of keys) {
        const parts = key.split(':');
        const userId = parts[parts.length - 1];
        onlineUserIds.push(userId);
      }
    } while (cursor !== '0');
    return onlineUserIds;
  }

  private respondOk(
    ack: ((resp: unknown) => void) | undefined,
    payload: unknown,
  ) {
    if (ack) {
      ack(payload);
    }
  }

  private respondError(
    ack: ((resp: unknown) => void) | undefined,
    client: Socket,
    status: number,
    detail: string,
  ) {
    const error = {
      ok: false,
      error: {
        type: 'about:blank',
        title: 'Request failed',
        status,
        detail,
        instance: client.nsp.name,
      },
    };
    if (ack) {
      ack(error);
    }
  }

  private respondException(
    ack: ((resp: unknown) => void) | undefined,
    client: Socket,
    error: unknown,
  ) {
    if (error instanceof NotFoundError) {
      return this.respondError(ack, client, 404, error.message);
    }
    if (error instanceof ForbiddenError) {
      return this.respondError(ack, client, 403, error.message);
    }
    if (error instanceof HttpException) {
      return this.respondError(ack, client, error.getStatus(), error.message);
    }
    this.logger.warn(
      JSON.stringify({ event: 'ws_error', error: String(error) }),
    );
    return this.respondError(ack, client, 500, 'Internal error');
  }
}

class NotFoundError extends Error {}
class ForbiddenError extends Error {}
