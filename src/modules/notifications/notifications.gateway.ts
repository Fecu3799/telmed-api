import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { verify } from 'jsonwebtoken';
import type { Actor } from '../../common/types/actor.type';
import type { JwtAccessPayload } from '../auth/auth.types';
import { getTraceId } from '../../common/request-context';

@WebSocketGateway({
  namespace: '/notifications',
  cors: { origin: true, credentials: true },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(private readonly configService: ConfigService) {}

  handleConnection(client: Socket) {
    const actor = this.getActor(client);
    const traceId = getTraceId() ?? null;

    if (!actor) {
      client.disconnect();
      return;
    }

    client.join(this.userRoom(actor.id));
    client.join(this.roleRoom(actor.role, actor.id));

    this.logger.log(
      JSON.stringify({
        event: 'notifications_connection',
        socketId: client.id,
        userId: actor.id,
        role: actor.role,
        traceId,
      }),
    );
  }

  handleDisconnect(client: Socket) {
    const actor = this.getActor(client);
    const traceId = getTraceId() ?? null;
    this.logger.log(
      JSON.stringify({
        event: 'notifications_disconnection',
        socketId: client.id,
        userId: actor?.id ?? null,
        role: actor?.role ?? null,
        traceId,
      }),
    );
  }

  emitAppointmentsChanged(userId: string) {
    this.server?.to(this.userRoom(userId)).emit('appointments.changed', {
      userId,
    });
  }

  emitEmergenciesChanged(userId: string) {
    this.server?.to(this.userRoom(userId)).emit('emergencies.changed', {
      userId,
    });
  }

  emitConsultationsChanged(userId: string) {
    this.server?.to(this.userRoom(userId)).emit('consultations.changed', {
      userId,
    });
  }

  private userRoom(userId: string) {
    return `user:${userId}`;
  }

  private roleRoom(role: string, userId: string) {
    return `${role}:${userId}`;
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
}
