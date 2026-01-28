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
  private isPoolEnded = false;

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
      const target = event.target ?? '';

      let model = 'Prisma';
      let action = 'query';

      if (target && target.includes('.')) {
        const parts = target.split('.');
        if (parts.length >= 2 && parts[0] && parts[1]) {
          model = parts[0];
          action = parts[1];
        } else if (parts[0]) {
          model = 'Prisma';
          action = parts[0];
        }
      } else if (target && target !== 'unknown') {
        model = 'Prisma';
        action = target;
      }

      let whereSummary: string | undefined;
      if (this.queryLogEnabled && event.params) {
        try {
          const params = JSON.parse(event.params);
          if (params.length > 0 && typeof params[0] === 'object') {
            const keys = Object.keys(params[0]).slice(0, 5);
            whereSummary =
              keys.length > 0 ? `{${keys.join(',')}...}` : undefined;
          }
        } catch {
          // Ignore parsing errors
        }
      }

      if (this.perfService) {
        this.perfService.recordSlowQuery({
          ts: Date.now(),
          model,
          action,
          durationMs,
          traceId,
          whereSummary,
        });
      }

      const payload: Record<string, unknown> = {
        msg: 'slow_query',
        traceId,
        durationMs,
        model,
        action,
        target: target || 'unknown',
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
    try {
      await this.$disconnect();
    } catch (error) {
      this.logger.warn('Error disconnecting Prisma client:', error);
    }

    if (!this.isPoolEnded) {
      this.isPoolEnded = true;
      try {
        await this.pool.end();
      } catch (error) {
        // Ignore errors if pool is already ended
        if (
          error instanceof Error &&
          !error.message.includes('Called end on pool more than once')
        ) {
          this.logger.warn('Error ending pool:', error);
        }
      }
    }
  }
}
