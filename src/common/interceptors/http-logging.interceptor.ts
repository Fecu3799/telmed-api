import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { Actor } from '../types/actor.type';

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(HttpLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<
      Request & { traceId?: string; user?: Actor }
    >();
    const response = http.getResponse();
    const start = Date.now();

    return next.handle().pipe(
      finalize(() => {
        const durationMs = Date.now() - start;
        const traceId = request.traceId ?? null;
        const actor = request.user ?? null;
        const logPayload = {
          traceId,
          method: request.method,
          path: request.originalUrl ?? request.url,
          statusCode: response.statusCode,
          durationMs,
          actor: actor
            ? { userId: actor.id ?? null, role: actor.role ?? null }
            : null,
        };

        this.logger.log(JSON.stringify(logPayload));
      }),
    );
  }
}
