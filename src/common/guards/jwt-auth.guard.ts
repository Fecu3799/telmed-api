import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
// Uses the JWT strategy to populate req.user with the authenticated actor.
export class JwtAuthGuard extends AuthGuard('jwt') {}
