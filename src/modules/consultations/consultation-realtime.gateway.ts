import { HttpException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { verify } from 'jsonwebtoken';
import { ConsultationStatus, UserRole } from '@prisma/client';
import type { JwtAccessPayload } from '../auth/auth.types';
import type { Actor } from '../../common/types/actor.type';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ConsultationRealtimeService } from './consultation-realtime.service';
import { RedisService } from '../../infra/redis/redis.service';
import { AuditService } from '../../infra/audit/audit.service';
import { AuditAction } from '@prisma/client';
import { getTraceId } from '../../common/request-context';

type JoinPayload = { consultationId: string };
type PingPayload = { consultationId: string };
type ChatSendPayload = {
  consultationId: string;
  clientMsgId?: string;
  text: string;
};
type ChatDeliveredPayload = { consultationId: string; messageId: string };

@WebSocketGateway({
  namespace: '/consultations',
  cors: { origin: true, credentials: true },
})
export class ConsultationRealtimeGateway {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(ConsultationRealtimeGateway.name);
  private readonly presenceTtlSeconds = 30;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly realtimeService: ConsultationRealtimeService,
    private readonly redisService: RedisService,
    private readonly auditService: AuditService,
  ) {}

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
      const consultation = await this.getConsultationForParticipant(
        actor,
        payload.consultationId,
      );

      if (consultation.status !== ConsultationStatus.in_progress) {
        return this.respondError(
          ack,
          client,
          409,
          'Consultation not in progress',
        );
      }

      const room = this.roomName(payload.consultationId);
      await client.join(room);
      await this.setPresence(payload.consultationId, actor.id);

      const presence = await this.getPresence(payload.consultationId);
      this.server.to(room).emit('presence.state', {
        consultationId: payload.consultationId,
        onlineUserIds: presence,
      });

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

  private async getConsultationForParticipant(
    actor: Actor,
    consultationId: string,
  ) {
    if (actor.role !== UserRole.doctor && actor.role !== UserRole.patient) {
      throw new ForbiddenError('Forbidden');
    }

    const consultation = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
    });

    if (!consultation) {
      throw new NotFoundError('Consultation not found');
    }

    if (
      (actor.role === UserRole.doctor &&
        consultation.doctorUserId !== actor.id) ||
      (actor.role === UserRole.patient &&
        consultation.patientUserId !== actor.id)
    ) {
      throw new ForbiddenError('Forbidden');
    }

    return consultation;
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
