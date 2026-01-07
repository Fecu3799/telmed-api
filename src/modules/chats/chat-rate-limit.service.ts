import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../infra/redis/redis.service';

@Injectable()
export class ChatRateLimitService {
  private readonly logger = new Logger(ChatRateLimitService.name);
  private readonly timezone = 'America/Argentina/Buenos_Aires';

  constructor(private readonly redis: RedisService) {}

  /**
   * Check burst limit: max N messages in M seconds
   * Key: chat:burst:{threadId}:{patientUserId}
   * Returns true if allowed, false if rate limited
   */
  async checkBurstLimit(
    threadId: string,
    patientUserId: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; error?: string }> {
    try {
      const key = `chat:burst:${threadId}:${patientUserId}`;
      const client = this.redis.getClient();

      const count = await client.incr(key);
      if (count === 1) {
        // First message in window, set TTL
        await client.expire(key, windowSeconds);
      }

      if (count > limit) {
        return {
          allowed: false,
          error: 'RATE_LIMITED',
        };
      }

      return { allowed: true };
    } catch (error) {
      // Conservative: deny on Redis failure to prevent abuse
      this.logger.error(
        JSON.stringify({
          event: 'chat_burst_limit_check_failed',
          threadId,
          patientUserId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return {
        allowed: false,
        error: 'RATE_LIMITED',
      };
    }
  }

  /**
   * Check daily limit: max N messages per day (in Argentina timezone)
   * Key: chat:daily:{threadId}:{patientUserId}:{YYYYMMDD}
   * Returns true if allowed, false if limit reached
   */
  async checkDailyLimit(
    threadId: string,
    patientUserId: string,
    limit: number,
  ): Promise<{ allowed: boolean; error?: string }> {
    try {
      const now = new Date();
      // Format date in Argentina timezone (America/Argentina/Buenos_Aires)
      // Format: YYYYMMDD
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: this.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      const parts = formatter.formatToParts(now);
      const year = parts.find((p) => p.type === 'year')?.value ?? '';
      const month = parts.find((p) => p.type === 'month')?.value ?? '';
      const day = parts.find((p) => p.type === 'day')?.value ?? '';
      const dateStr = `${year}${month}${day}`;
      const key = `chat:daily:${threadId}:${patientUserId}:${dateStr}`;

      const client = this.redis.getClient();
      const count = await client.incr(key);

      if (count === 1) {
        // First message today, set TTL until end of day
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        const ttlSeconds = Math.ceil(
          (tomorrow.getTime() - now.getTime()) / 1000,
        );
        await client.expire(key, ttlSeconds);
      }

      if (count > limit) {
        return {
          allowed: false,
          error: 'DAILY_LIMIT_REACHED',
        };
      }

      return { allowed: true };
    } catch (error) {
      // Conservative: deny on Redis failure
      this.logger.error(
        JSON.stringify({
          event: 'chat_daily_limit_check_failed',
          threadId,
          patientUserId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return {
        allowed: false,
        error: 'DAILY_LIMIT_REACHED',
      };
    }
  }
}
