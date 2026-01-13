import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { ConfigService } from '@nestjs/config';
import { Actor } from '../../common/types/actor.type';
import { PerfService } from './perf.service';

@Injectable()
export class PerfInterceptor implements NestInterceptor {
  private readonly logger = new Logger(PerfInterceptor.name);
  private readonly enabled: boolean;
  private readonly thresholdMs: number;
  private readonly sampleRate: number;

  constructor(
    private readonly perfService: PerfService,
    private readonly config: ConfigService,
  ) {
    this.enabled = this.config.get<boolean>('PERF_METRICS_ENABLED') ?? true;
    this.thresholdMs = this.config.get<number>('SLOW_REQ_THRESHOLD_MS') ?? 500;
    this.sampleRate = this.config.get<number>('PERF_SAMPLE_RATE') ?? 1.0;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.enabled) {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<
      Request & { traceId?: string; user?: Actor }
    >();
    const response = http.getResponse();
    const start = performance.now();

    return next.handle().pipe(
      finalize(() => {
        const durationMs = performance.now() - start;

        // Only record and log if exceeds threshold
        if (durationMs >= this.thresholdMs) {
          // Apply sample rate
          if (Math.random() > this.sampleRate) {
            return;
          }

          const traceId = request.traceId ?? null;
          const actor = request.user ?? null;
          const routeKey = this.getRouteKey(request);

          // Record in PerfService
          this.perfService.recordSlowRequest({
            ts: Date.now(),
            method: request.method,
            path: request.originalUrl ?? request.url,
            routeKey,
            statusCode: response.statusCode,
            durationMs: Math.round(durationMs),
            traceId,
            actorId: actor?.id ?? null,
            userAgent: request.headers['user-agent'],
            ip:
              (request.headers['x-forwarded-for'] as string)
                ?.split(',')[0]
                ?.trim() ??
              request.ip ??
              request.socket.remoteAddress,
          });

          // Log slow request (structured)
          const logPayload = {
            msg: 'slow_request',
            durationMs: Math.round(durationMs),
            method: request.method,
            path: request.originalUrl ?? request.url,
            routeKey,
            statusCode: response.statusCode,
            traceId,
            actorId: actor?.id ?? null,
          };

          this.logger.warn(JSON.stringify(logPayload));
        }
      }),
    );
  }

  private getRouteKey(req: Request): string {
    // Prefer req.route?.path if available (from Express router)
    if (req.route?.path) {
      return `${req.method} ${req.route.path}`;
    }

    // Fallback: use method + pathname (without query)
    const url = new URL(req.originalUrl ?? req.url, 'http://dummy');
    return `${req.method} ${url.pathname}`;
  }
}
