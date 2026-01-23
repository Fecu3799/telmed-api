import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtAccessPayload } from '../auth.types';

/**
 * JWT access validation
 * - Valida el access token (Bearer) y produce el "actor" minimo para el request.
 *
 * How it works:
 * - Usa ExtractJwt.fromAuthHeaderAsBearerToken() y JWT_ACCESS_SECRET.
 * - En validate devuelve { id: payload.sub, role: payload.role }
 *   (lo que consumen guards/controllers).
 */

@Injectable()
export class AccessTokenStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  validate(payload: JwtAccessPayload) {
    // Expose minimal actor data to guards/controllers.
    return { id: payload.sub, role: payload.role };
  }
}
