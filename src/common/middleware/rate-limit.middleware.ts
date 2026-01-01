import {
  HttpException,
  HttpStatus,
  Injectable,
  NestMiddleware,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RateLimitService } from '../../infra/rate-limit/rate-limit.service';

type RateLimitOptions = {
  keyPrefix: string;
  limit: number;
  windowMs: number;
};

function getClientIp(req: Request) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim() ?? req.ip;
  }
  return req.ip;
}

@Injectable()
class ConfiguredRateLimitMiddleware implements NestMiddleware {
  constructor(
    protected readonly rateLimit: RateLimitService,
    protected readonly options: RateLimitOptions,
  ) {}

  use(req: Request, _res: Response, next: NextFunction) {
    const ip = getClientIp(req);
    const key = `${this.options.keyPrefix}:${ip}`;
    const result = this.rateLimit.consume(
      key,
      this.options.limit,
      this.options.windowMs,
    );

    if (!result.allowed) {
      throw new HttpException(
        'Rate limit exceeded',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    next();
  }
}

export function createRateLimitMiddleware(options: RateLimitOptions) {
  @Injectable()
  class RateLimitMiddleware implements NestMiddleware {
    constructor(public readonly rateLimit: RateLimitService) {}

    use(req: Request, res: Response, next: NextFunction) {
      return new ConfiguredRateLimitMiddleware(this.rateLimit, options).use(
        req,
        res,
        next,
      );
    }
  }
  return RateLimitMiddleware;
}
