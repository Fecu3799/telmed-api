import { Injectable } from '@nestjs/common';

type RateLimitEntry = { count: number; resetAt: number };

@Injectable()
export class RateLimitService {
  private readonly store = new Map<string, RateLimitEntry>();

  isEnabled() {
    if (process.env.NODE_ENV !== 'test') {
      return true;
    }
    return String(process.env.RATE_LIMIT_ENABLED).toLowerCase() === 'true';
  }

  consume(key: string, limit: number, windowMs: number) {
    if (!this.isEnabled()) {
      return { allowed: true, remaining: limit, resetAt: Date.now() };
    }

    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || entry.resetAt <= now) {
      const resetAt = now + windowMs;
      this.store.set(key, { count: 1, resetAt });
      return { allowed: true, remaining: limit - 1, resetAt };
    }

    if (entry.count >= limit) {
      return { allowed: false, remaining: 0, resetAt: entry.resetAt };
    }

    entry.count += 1;
    return {
      allowed: true,
      remaining: limit - entry.count,
      resetAt: entry.resetAt,
    };
  }

  clear() {
    this.store.clear();
  }
}
