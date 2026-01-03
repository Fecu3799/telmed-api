import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor(configService: ConfigService) {
    const redisUrl = configService.getOrThrow<string>('REDIS_URL');
    this.client = new Redis(redisUrl);
  }

  getClient(): Redis {
    return this.client;
  }

  async onModuleDestroy() {
    try {
      await this.client.quit();
    } catch (error) {
      // Avoid crashing on shutdown due to Redis connection issues.
      this.logger.warn(
        JSON.stringify({
          event: 'redis_disconnect_failed',
          error: String(error),
        }),
      );
    }
  }
}
