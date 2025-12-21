import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Actor } from '../types/actor.type';

export const CurrentUser = createParamDecorator(
  (_, ctx: ExecutionContext): Actor | undefined => {
    const request = ctx.switchToHttp().getRequest();
    const direct = request.user as Actor | undefined;
    if (direct && direct.id && direct.role) {
      return direct;
    }

    const nested = request.user?.actor as Actor | undefined;
    if (nested && nested.id && nested.role) {
      return nested;
    }

    return request.actor as Actor | undefined;
  },
);
