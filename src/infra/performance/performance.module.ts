import { DynamicModule, Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PerfService } from './perf.service';
import { PerfInterceptor } from './perf.interceptor';
import { InternalPerfController } from './internal-perf.controller';

@Global()
@Module({})
export class PerformanceModule {
  static forRoot(): DynamicModule {
    return {
      module: PerformanceModule,
      imports: [ConfigModule],
      providers: [
        {
          provide: PerfService,
          useFactory: (config: ConfigService) => {
            const maxSlowRequests =
              config.get<number>('PERF_MAX_SLOW_REQUESTS') ?? 200;
            const maxSlowQueries =
              config.get<number>('PERF_MAX_SLOW_QUERIES') ?? 200;
            const topN = config.get<number>('PERF_TOP_N') ?? 20;
            return new PerfService(maxSlowRequests, maxSlowQueries, topN);
          },
          inject: [ConfigService],
        },
        PerfInterceptor,
      ],
      exports: [PerfService, PerfInterceptor],
      controllers: [], // Controllers added conditionally
    };
  }

  static forRootWithController(): DynamicModule {
    const base = PerformanceModule.forRoot();
    const endpointEnabled =
      process.env.PERF_ENDPOINT_ENABLED === 'true' ||
      (process.env.NODE_ENV !== 'production' &&
        process.env.PERF_ENDPOINT_ENABLED !== 'false');

    return {
      ...base,
      controllers: endpointEnabled ? [InternalPerfController] : [],
    };
  }
}
