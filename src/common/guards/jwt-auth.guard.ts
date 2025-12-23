import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
// Uses the JWT strategy to populate req.user with the authenticated actor.
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = unknown>(err: unknown, user: TUser | false) {
    if (err) {
      if (err instanceof Error) {
        throw err;
      }
      throw new UnauthorizedException();
    }
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
