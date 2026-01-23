import { UserRole } from '@prisma/client';

/**
 * Auth DTO types
 * - Define los tipos de payload JWT y el shape de tokens que devuelve AuthService.
 *
 * How it works:
 * - JwtAccessPayload: { sub, role }
 * - JwtRefreshPayload: lo mismo + sid (session id)
 * AuthTokens: { accessToken, refreshToken }
 *
 * Key points:
 * - accessToken: { sub, role } para endpoints autenticados.
 * - refreshToken: { sub, role, sid } para rotacion/logout.
 * - sid: string unico para cada sesion, usado para identificar/revocar.
 */

export type JwtAccessPayload = {
  sub: string;
  role: UserRole;
};

export type JwtRefreshPayload = JwtAccessPayload & {
  sid: string;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};
