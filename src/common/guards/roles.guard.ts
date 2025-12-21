import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Actor } from '../types/actor.type';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    // Request user is injected by the JWT guard/strategy.
    const request = context.switchToHttp().getRequest();
    const user = request.user as Actor | undefined;

    const candidatePathsChecked = [
      'req.user.role',
      'req.user.actor.role',
      'req.actor.role',
    ];

    const roleCandidate =
      user?.role ?? request.user?.actor?.role ?? request.actor?.role;

    const normalized = requiredRoles.map((role: unknown) =>
      String(role).toLowerCase(),
    );
    const actorRole = roleCandidate ? String(roleCandidate).toLowerCase() : null;

    const allowed = actorRole ? normalized.includes(actorRole) : false;
    if (allowed) {
      return true;
    }

    if (!actorRole) {
      this.throwUnauthorizedIfDebug(request, requiredRoles, actorRole, candidatePathsChecked);
    }

    if (this.isDebugAuthEnabled()) {
      const debugPayload = this.buildDebugPayload(
        request,
        requiredRoles,
        actorRole,
        candidatePathsChecked,
      );
      this.logger.debug(JSON.stringify(debugPayload));
      throw new ForbiddenException({
        message: 'Forbidden',
        extensions: { debug: debugPayload },
      });
    }

    return false;
  }

  private isDebugAuthEnabled(): boolean {
    return (
      process.env.NODE_ENV === 'test' ||
      String(process.env.DEBUG_AUTH).toLowerCase() === 'true'
    );
  }

  private buildDebugPayload(
    request: Record<string, unknown>,
    requiredRoles: unknown[],
    resolvedRole: string | null,
    candidatePathsChecked: string[],
  ) {
    const method = request.method;
    const url = request.originalUrl ?? request.url;
    const user = request.user as Record<string, unknown> | undefined;
    const actor = request.actor as Record<string, unknown> | undefined;

    return {
      method,
      url,
      requiredRoles,
      resolvedRole,
      candidatePathsChecked,
      userKeys: user ? Object.keys(user) : [],
      userSnapshot: user ? this.safeActorSnapshot(user) : null,
      actorSnapshot: actor ? this.safeActorSnapshot(actor) : null,
    };
  }

  private throwUnauthorizedIfDebug(
    request: Record<string, unknown>,
    requiredRoles: unknown[],
    resolvedRole: string | null,
    candidatePathsChecked: string[],
  ) {
    if (this.isDebugAuthEnabled()) {
      const debugPayload = this.buildDebugPayload(
        request,
        requiredRoles,
        resolvedRole,
        candidatePathsChecked,
      );
      this.logger.debug(JSON.stringify(debugPayload));
      throw new UnauthorizedException({
        message: 'Unauthorized',
        extensions: { debug: debugPayload },
      });
    }

    throw new UnauthorizedException();
  }

  private safeActorSnapshot(source: Record<string, unknown>) {
    return {
      id: source.id ?? null,
      role: source.role ?? null,
      sessionId: source.sessionId ?? source.sid ?? null,
    };
  }
}
