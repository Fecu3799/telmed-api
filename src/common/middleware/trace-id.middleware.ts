import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { runWithContext } from '../request-context';

@Injectable()
export class TraceIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const headerValue = req.header('x-request-id');
    const traceId =
      headerValue && headerValue.length > 0 ? headerValue : randomUUID();

    (req as Request & { traceId?: string }).traceId = traceId;
    res.setHeader('X-Request-Id', traceId);

    runWithContext({ traceId }, () => next());
  }
}
