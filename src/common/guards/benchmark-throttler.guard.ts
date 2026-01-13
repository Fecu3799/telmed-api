import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import {
  getOptionsToken,
  getStorageToken,
} from '@nestjs/throttler/dist/throttler.providers';

@Injectable()
export class BenchmarkThrottlerGuard
  extends ThrottlerGuard
  implements CanActivate
{
  constructor(
    @Inject(getOptionsToken()) options: any,
    @Inject(getStorageToken()) storageService: any,
    reflector: Reflector,
    private readonly configService: ConfigService,
  ) {
    super(options, storageService, reflector);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const nodeEnv = process.env.NODE_ENV || 'development';
    const benchmarkModeValue = this.configService.get(
      'THROTTLE_BENCHMARK_MODE',
    );
    const benchmarkModeStr =
      benchmarkModeValue !== undefined && benchmarkModeValue !== null
        ? String(benchmarkModeValue)
        : 'false';
    const benchmarkMode = benchmarkModeStr.toLowerCase() === 'true';

    if (benchmarkMode && nodeEnv !== 'production') {
      return true;
    }

    return super.canActivate(context);
  }
}
