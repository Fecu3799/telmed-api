import { UserRole } from '@prisma/client';

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
