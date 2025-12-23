/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { getTraceId } from '../../common/request-context';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly pool: Pool;
  private readonly logger = new Logger(PrismaService.name);
  private readonly slowQueryMs: number;

  constructor(config: ConfigService) {
    const url = config.getOrThrow<string>('DATABASE_URL');
    const slowQueryMs = Number(config.get('SLOW_QUERY_MS') ?? 200);

    const pool = new Pool({ connectionString: url });
    const adapter = new PrismaPg(pool);

    // cast para evitar peleas de tipado si tu PrismaClientOptions está “raro”
    super({ adapter, log: [{ emit: 'event', level: 'query' }] } as any);

    this.pool = pool;
    this.slowQueryMs = Number.isFinite(slowQueryMs) ? slowQueryMs : 200;

    (
      this as unknown as { $on: (event: string, cb: (e: any) => void) => void }
    ).$on('query', (event: any) => {
      if (event.duration <= this.slowQueryMs) {
        return;
      }

      const payload: Record<string, unknown> = {
        event: 'slowQuery',
        traceId: getTraceId() ?? null,
        durationMs: event.duration,
        target: event.target ?? null,
      };

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
