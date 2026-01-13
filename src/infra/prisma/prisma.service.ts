/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { getTraceId } from '../../common/request-context';
import { PerfService } from '../performance/perf.service';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly pool: Pool;
  private readonly logger = new Logger(PrismaService.name);
  private readonly slowQueryMs: number;
  private readonly queryLogEnabled: boolean;

  constructor(
    config: ConfigService,
    @Optional() private readonly perfService?: PerfService,
  ) {
    const url = config.getOrThrow<string>('DATABASE_URL');
    const slowQueryMs =
      Number(config.get('PRISMA_SLOW_QUERY_MS')) ||
      Number(config.get('SLOW_QUERY_MS')) ||
      200;
    const queryLogEnabled =
      config.get<boolean>('PRISMA_QUERY_LOG_ENABLED') ?? false;

    const pool = new Pool({ connectionString: url });
    const adapter = new PrismaPg(pool);

    // cast para evitar peleas de tipado si tu PrismaClientOptions está “raro”
    super({ adapter, log: [{ emit: 'event', level: 'query' }] } as any);

    this.pool = pool;
    this.slowQueryMs = Number.isFinite(slowQueryMs) ? slowQueryMs : 200;
    this.queryLogEnabled = queryLogEnabled;

    (
      this as unknown as { $on: (event: string, cb: (e: any) => void) => void }
    ).$on('query', (event: any) => {
      const durationMs = event.duration;

      // Only process slow queries
      if (durationMs <= this.slowQueryMs) {
        return;
      }

      const traceId = getTraceId() ?? null;
      const target = event.target ?? 'unknown';
      const [model, action] = target.split('.');

      // Extract where summary (sanitized, no sensitive data)
      let whereSummary: string | undefined;
      if (this.queryLogEnabled && event.params) {
        try {
          const params = JSON.parse(event.params);
          if (params.length > 0 && typeof params[0] === 'object') {
            // Extract just the structure, not the values
            const keys = Object.keys(params[0]).slice(0, 5); // Limit to 5 keys
            whereSummary = keys.length > 0 ? `{${keys.join(',')}...}` : undefined;
          }
        } catch {
          // Ignore parsing errors
        }
      }

      // Record in PerfService if available
      if (this.perfService) {
        this.perfService.recordSlowQuery({
          ts: Date.now(),
          model: model ?? 'unknown',
          action: action ?? 'unknown',
          durationMs,
          traceId,
          whereSummary,
        });
      }

      // Log slow query (structured)
      const payload: Record<string, unknown> = {
        msg: 'slow_query',
        traceId,
        durationMs,
        model: model ?? 'unknown',
        action: action ?? 'unknown',
        target,
      };

      if (whereSummary) {
        payload.whereSummary = whereSummary;
      }

      if (String(process.env.DEBUG_DB).toLowerCase() === 'true') {
        payload.query = event.query;
        payload.params = event.params;
      }

      this.logger.warn(JSON.stringify(payload));
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }
}
