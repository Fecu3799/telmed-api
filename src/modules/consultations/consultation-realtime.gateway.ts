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
import type {
  QueueSubscribePayload,
  QueueSubscribedPayload,
  ConsultationStartedPayload,
} from './consultation-realtime.events';

type JoinPayload = { consultationId: string };
type PingPayload = { consultationId: string };
// Removed: ChatSendPayload, ChatDeliveredPayload - chat messages now handled by chats module

/**
 * Socket.IO /consultations (join,presence,queue subscribe, events)
 * - Gateway Socket.IO para presencia en consulta y eventos operativos (join/ping + notifications start/closed)
 *
 * How it works:
 * - Namespace /consultations. Autenticación por Bearer token en handshake y guarda client.data.actor.
 * - queue:subscribe {queueItemId}: valida acceso al queue item y une al room queueItem:{id} (para notificar consultation:started)
 * - consultation.join: valida acceso a consulta; join a room consultation:{id}; si está in_progress, setea presence en Redis
 *   y emite presence.state
 * - presence.ping: renueva TTL y re-emite presence.state.
 * - Publisher methods: emitConsultationStarted (al room de queue), emitConsultationClosed (al room de consulta).
 *
 * Key points:
 * - Presencia basada en Redis SCAN sobre keys presence:consultation:{id}:*
 * - emitConsultationStarted es "best effort": loguea recipients estimados y no rompe si nadie está suscripto.
 *
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
    const namespace = client.nsp.name;
    const traceId = getTraceId() ?? null;
    this.logger.log(
      JSON.stringify({
        event: 'ws_connection',
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
    // Note: Socket.IO doesn't provide a reliable way to distinguish client vs server disconnect
    // in the disconnect handler, so we log a generic reason
    this.logger.log(
      JSON.stringify({
        event: 'ws_disconnection',
        socketId: client.id,
        namespace,
        userId: actor?.id ?? null,
        role: actor?.role ?? null,
        traceId,
      }),
    );
  }

  /**
   * Subscribe to queue item updates (patient waiting for doctor to start)
   * Client emits: queue:subscribe { queueItemId }
   * Server joins socket to room: queueItem:{queueItemId}
   * Server emits consultation:started when doctor starts the consultation
   */
  @SubscribeMessage('queue:subscribe')
  async handleQueueSubscribe(
    client: Socket,
    payload: QueueSubscribePayload,
    ack?: (resp: unknown) => void,
  ) {
    const actor = this.getActor(client);
    if (!actor) {
      return this.respondError(ack, client, 401, 'Unauthorized');
    }

    const traceId = getTraceId() ?? null;
    const room = this.queueRoomName(payload.queueItemId);

    // Log request
    this.logger.log(
      JSON.stringify({
        event: 'queue_subscribe_request',
        socketId: client.id,
        queueItemId: payload.queueItemId,
        roomName: room,
        userId: actor.id,
        role: actor.role,
        namespace: client.nsp.name,
        traceId,
      }),
    );

    try {
      // Validate actor has access to this queue item
      const queue = await this.queueAccessService.canAccess(
        actor,
        payload.queueItemId,
      );

      // Join socket to queue room for event notifications
      await client.join(room);

      // Get client rooms for observability (defensive check)
      const clientRooms: string[] = [];
      try {
        if (this.server?.sockets?.adapter) {
          const roomSockets = this.server.sockets.adapter.rooms?.get(room);
          const roomSize = roomSockets?.size ?? 0;
          // Get all rooms this client is in
          const allRooms = Array.from(client.rooms);
          clientRooms.push(...allRooms);

          this.logger.log(
            JSON.stringify({
              event: 'queue_subscribe_success',
              socketId: client.id,
              queueItemId: payload.queueItemId,
              roomName: room,
              userId: actor.id,
              role: actor.role,
              roomSize,
              clientRooms,
              namespace: client.nsp.name,
              traceId,
            }),
          );
        }
      } catch (roomCheckError) {
        // Non-critical: log but don't fail
        this.logger.warn(
          JSON.stringify({
            event: 'queue_subscribe_room_check_failed',
            socketId: client.id,
            queueItemId: payload.queueItemId,
            roomName: room,
            error:
              roomCheckError instanceof Error
                ? roomCheckError.message
                : String(roomCheckError),
            traceId,
          }),
        );
      }

      // Emit confirmation to client
      return this.respondOk(ack, {
        ok: true,
        subscribed: true,
        queueItemId: payload.queueItemId,
      });
    } catch (error) {
      // Log error with stack trace
      const errorStack = error instanceof Error ? error.stack : String(error);
      this.logger.error(
        JSON.stringify({
          event: 'queue_subscribe_error',
          socketId: client.id,
          queueItemId: payload.queueItemId,
          roomName: room,
          userId: actor.id,
          role: actor.role,
          error: errorStack,
          traceId,
        }),
      );

      // If auth/permission fails, emit error response
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof HttpException
      ) {
        return this.respondException(ack, client, error);
      }
      // For other errors, disconnect for security
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

  // Removed: chat.send and chat.delivered handlers
  // Chat messages are now handled by the chats module (ChatsGateway in /chats namespace)

  /**
   * Emit consultation:started event to queue room when doctor starts consultation.
   * Called when a consultation transitions to in_progress (e.g., doctor starts from queue).
   * @param queueItemId - The queue item ID (to emit to queueItem:{queueItemId} room)
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
    // Defensive check: ensure server is initialized
    if (!this.server) {
      this.logger.error(
        JSON.stringify({
          event: 'consultation_started_publish_failed',
          queueItemId,
          consultationId,
          reason: 'WebSocket server not initialized',
          traceId: traceId ?? null,
        }),
      );
      return;
    }

    // Log publish attempt
    this.logger.log(
      JSON.stringify({
        event: 'consultation_started_publish_attempt',
        queueItemId,
        consultationId,
        roomName,
        traceId: traceId ?? null,
      }),
    );

    const payload = {
      queueItemId,
      consultationId,
      roomName,
      livekitUrl,
      startedAt: startedAt.toISOString(),
    };

    // Emit to queue room (where patient is subscribed)
    const queueRoom = this.queueRoomName(queueItemId);
    let queueRoomRecipientsCount = 0;

    try {
      // Defensive check for adapter and rooms
      if (
        this.server.sockets?.adapter?.rooms &&
        typeof this.server.sockets?.adapter?.rooms.get === 'function'
      ) {
        const queueRoomSockets =
          this.server.sockets.adapter.rooms.get(queueRoom);
        queueRoomRecipientsCount = queueRoomSockets?.size ?? 0;
      }

      // Emit to queue room (always emit, even if count is 0)
      this.server.to(queueRoom).emit('consultation:started', payload);

      // Log success
      this.logger.log(
        JSON.stringify({
          event: 'consultation_started_publish_success',
          queueItemId,
          consultationId,
          roomName,
          wsQueueRoom: queueRoom,
          recipientsEstimate: queueRoomRecipientsCount,
          namespace: '/consultations',
          traceId: traceId ?? null,
        }),
      );

      // Warn if no recipients in queue room (patient might not be connected)
      if (queueRoomRecipientsCount === 0) {
        this.logger.warn(
          JSON.stringify({
            event: 'consultation_started_no_recipients_in_queue_room',
            queueItemId,
            consultationId,
            queueRoom,
            reason: 'No sockets in queue room - patient may not be subscribed',
            traceId: traceId ?? null,
          }),
        );
      }
    } catch (error) {
      // Log error with stack trace
      const errorStack = error instanceof Error ? error.stack : String(error);
      this.logger.error(
        JSON.stringify({
          event: 'consultation_started_publish_failed',
          queueItemId,
          consultationId,
          roomName,
          error: errorStack,
          traceId: traceId ?? null,
        }),
      );
    }
  }

  emitConsultationClosed(consultationId: string, closedAt: Date) {
    this.server.to(this.roomName(consultationId)).emit('consultation.closed', {
      consultationId,
      closedAt: closedAt.toISOString(),
    });
  }

  emitFormatJobReady(
    consultationId: string,
    jobId: string,
    finalNoteId: string,
    traceId?: string | null,
  ) {
    if (!this.server) {
      return;
    }

    const payload = {
      jobId,
      consultationId,
      finalNoteId,
    };

    const room = this.roomName(consultationId);
    this.server.to(room).emit('clinicalNote.format.ready', payload);

    this.logger.log(
      JSON.stringify({
        event: 'format_job_ready_published',
        consultationId,
        jobId,
        room,
        traceId: traceId ?? null,
      }),
    );
  }

  emitFormatJobFailed(
    consultationId: string,
    jobId: string,
    errorCode: string,
    traceId?: string | null,
  ) {
    if (!this.server) {
      return;
    }

    const payload = {
      jobId,
      consultationId,
      errorCode,
    };

    const room = this.roomName(consultationId);
    this.server.to(room).emit('clinicalNote.format.failed', payload);

    this.logger.log(
      JSON.stringify({
        event: 'format_job_failed_published',
        consultationId,
        jobId,
        errorCode,
        room,
        traceId: traceId ?? null,
      }),
    );
  }

  // Removed: emitMessageCreated - chat messages are now handled by chats module (ChatsGateway)

  private roomName(consultationId: string) {
    return `consultation:${consultationId}`;
  }

  private queueRoomName(queueItemId: string) {
    return `queueItem:${queueItemId}`;
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
