import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Actor } from '../types/actor.type';

export const CurrentUser = createParamDecorator(
  (_, ctx: ExecutionContext): Actor | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as Actor | undefined;
  },
);
