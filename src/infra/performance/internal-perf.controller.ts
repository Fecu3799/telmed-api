import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { monitorEventLoopDelay } from 'perf_hooks';
import { PerfService } from './perf.service';

interface PerfMetricsResponse {
  uptimeSeconds: number;
  memory: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  cpu?: {
    user: number;
    system: number;
  };
  eventLoopLag?: {
    avg: number;
    max: number;
  };
  slowRequests: {
    last: Array<{
      ts: number;
      method: string;
      path: string;
      routeKey: string;
      statusCode: number;
      durationMs: number;
      traceId: string | null;
      actorId: string | null;
    }>;
    topRoutes: Array<{
      routeKey: string;
      count: number;
      avg: number;
      p50: number;
      p95: number;
      max: number;
      lastTs: number;
    }>;
  };
  slowQueries: {
    last: Array<{
      ts: number;
      model: string;
      action: string;
      durationMs: number;
      traceId: string | null;
      whereSummary?: string;
    }>;
    top: Array<{
      queryKey: string;
      count: number;
      avg: number;
      p50: number;
      p95: number;
      max: number;
      lastTs: number;
    }>;
  };
}

@Injectable()
@Controller('internal/perf')
export class InternalPerfController implements OnModuleInit, OnModuleDestroy {
  private eventLoopMonitor?: ReturnType<typeof monitorEventLoopDelay>;
  private startCpuUsage?: NodeJS.CpuUsage;

  constructor(
    private readonly perfService: PerfService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    // Start event loop monitoring
    this.eventLoopMonitor = monitorEventLoopDelay({
      resolution: 10, // 10ms resolution
    });
    this.eventLoopMonitor.enable();
    // Store initial CPU usage for delta calculation
    this.startCpuUsage = process.cpuUsage();
  }

  onModuleDestroy() {
    if (this.eventLoopMonitor) {
      this.eventLoopMonitor.disable();
    }
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  getMetrics(
    @Headers('x-internal-debug-token') token?: string,
  ): PerfMetricsResponse {
    // Check if endpoint is enabled
    const enabled = this.config.get<boolean>('PERF_ENDPOINT_ENABLED') ?? false;
    if (!enabled) {
      throw new UnauthorizedException('Performance endpoint is disabled');
    }

    // Check token if configured
    const requiredToken = this.config.get<string>('PERF_DEBUG_TOKEN');
    if (requiredToken && token !== requiredToken) {
      throw new UnauthorizedException('Invalid debug token');
    }

    const memUsage = process.memoryUsage();
    const cpuUsage = this.startCpuUsage
      ? process.cpuUsage(this.startCpuUsage)
      : undefined;
    const uptimeSeconds = process.uptime();

    // Calculate event loop lag
    let eventLoopLag: { avg: number; max: number } | undefined;
    if (this.eventLoopMonitor) {
      const stats = this.eventLoopMonitor;
      // Convert nanoseconds to milliseconds
      // Note: monitorEventLoopDelay doesn't have percentile() method, use mean and max
      eventLoopLag = {
        avg: stats.mean / 1_000_000,
        max: stats.max / 1_000_000,
      };
    }

    const topN = this.config.get<number>('PERF_TOP_N') ?? 20;

    // Get slow requests (last 50, top routes)
    const slowRequests = this.perfService.getSlowRequests(50);
    const topRoutes = this.perfService.getTopRoutes();

    // Get slow queries (last 50, top queries)
    const slowQueries = this.perfService.getSlowQueries(50);
    const topQueries = this.perfService.getTopQueries();

    return {
      uptimeSeconds,
      memory: {
        rss: memUsage.rss,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
      },
      cpu: cpuUsage
        ? {
            user: cpuUsage.user / 1_000_000, // Convert microseconds to seconds
            system: cpuUsage.system / 1_000_000,
          }
        : undefined,
      eventLoopLag,
      slowRequests: {
        last: slowRequests.map((r) => ({
          ts: r.ts,
          method: r.method,
          path: r.path,
          routeKey: r.routeKey,
          statusCode: r.statusCode,
          durationMs: r.durationMs,
          traceId: r.traceId,
          actorId: r.actorId,
        })),
        topRoutes: topRoutes.slice(0, topN),
      },
      slowQueries: {
        last: slowQueries.map((q) => ({
          ts: q.ts,
          model: q.model,
          action: q.action,
          durationMs: q.durationMs,
          traceId: q.traceId,
          whereSummary: q.whereSummary,
        })),
        top: topQueries.slice(0, topN),
      },
    };
  }
}
