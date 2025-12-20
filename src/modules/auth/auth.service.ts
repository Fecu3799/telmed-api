import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, SessionStatus, UserRole, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuthTokens, JwtAccessPayload, JwtRefreshPayload } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';

const INVALID_CREDENTIALS_MESSAGE = 'Invalid credentials';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto, ip?: string, userAgent?: string) {
    if (dto.role === UserRole.admin) {
      throw new UnprocessableEntityException(
        'Role not allowed for self-registration',
      );
    }

    const passwordHash = await argon2.hash(dto.password);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: dto.email.toLowerCase(),
            passwordHash,
            role: dto.role,
          },
        });

        const sessionId = randomUUID();
        const tokens = await this.buildTokens(user.id, user.role, sessionId);
        const refreshTokenHash = await argon2.hash(tokens.refreshToken);

        const expiresAt = this.getRefreshExpiresAt();
        await tx.session.create({
          data: {
            id: sessionId,
            userId: user.id,
            refreshTokenHash,
            status: SessionStatus.active,
            expiresAt,
            ip,
            userAgent,
          },
        });

        return { user, tokens };
      });

      return this.formatAuthResponse(
        result.user.id,
        result.user.role,
        result.user.email,
        result.tokens,
      );
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('Email already registered');
      }

      throw error;
    }
  }

  async login(dto: LoginDto, ip?: string, userAgent?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    if (user.status === UserStatus.disabled) {
      throw new ForbiddenException('User disabled');
    }

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const sessionId = randomUUID();
    const tokens = await this.buildTokens(user.id, user.role, sessionId);
    const refreshTokenHash = await argon2.hash(tokens.refreshToken);

    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        refreshTokenHash,
        status: SessionStatus.active,
        expiresAt: this.getRefreshExpiresAt(),
        ip,
        userAgent,
      },
    });

    return this.formatAuthResponse(user.id, user.role, user.email, tokens);
  }

  async refresh(
    dto: RefreshDto,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthTokens> {
    const payload = await this.verifyRefreshToken(dto.refreshToken);
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      include: { user: true },
    });

    if (!session || session.userId !== payload.sub) {
      throw new UnauthorizedException('Invalid session');
    }

    if (session.status !== SessionStatus.active || session.revokedAt) {
      throw new UnauthorizedException('Session revoked');
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Session expired');
    }

    if (session.user.status === UserStatus.disabled) {
      throw new ForbiddenException('User disabled');
    }

    const refreshMatches = await argon2.verify(
      session.refreshTokenHash,
      dto.refreshToken,
    );
    if (!refreshMatches) {
      throw new UnauthorizedException('Invalid session');
    }

    const nextSessionId = randomUUID();
    const tokens = await this.buildTokens(
      session.userId,
      session.user.role,
      nextSessionId,
    );
    const refreshTokenHash = await argon2.hash(tokens.refreshToken);
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.session.update({
        where: { id: session.id },
        data: {
          status: SessionStatus.rotated,
          revokedAt: now,
          lastUsedAt: now,
        },
      }),
      this.prisma.session.create({
        data: {
          id: nextSessionId,
          userId: session.userId,
          refreshTokenHash,
          status: SessionStatus.active,
          expiresAt: this.getRefreshExpiresAt(),
          ip,
          userAgent,
        },
      }),
    ]);

    return tokens;
  }

  async logout(refreshToken: string, actorId: string) {
    const payload = await this.verifyRefreshToken(refreshToken);

    if (payload.sub !== actorId) {
      throw new ForbiddenException('Session does not belong to current user');
    }

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
    });

    if (!session || session.userId !== actorId) {
      return;
    }

    if (session.status !== SessionStatus.active || session.revokedAt) {
      return;
    }

    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        status: SessionStatus.revoked,
        revokedAt: new Date(),
      },
    });
  }

  private async buildTokens(
    userId: string,
    role: UserRole,
    sessionId: string,
  ): Promise<AuthTokens> {
    const accessPayload: JwtAccessPayload = { sub: userId, role };
    const refreshPayload: JwtRefreshPayload = {
      sub: userId,
      role,
      sid: sessionId,
    };

    const accessToken = await this.jwtService.signAsync(accessPayload, {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: `${this.getAccessTtlSeconds()}s`,
    });

    const refreshToken = await this.jwtService.signAsync(refreshPayload, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: `${this.getRefreshTtlSeconds()}s`,
    });

    return { accessToken, refreshToken };
  }

  private async verifyRefreshToken(
    refreshToken: string,
  ): Promise<JwtRefreshPayload> {
    try {
      return await this.jwtService.verifyAsync<JwtRefreshPayload>(
        refreshToken,
        {
          secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        },
      );
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private getAccessTtlSeconds() {
    return this.configService.getOrThrow<number>('JWT_ACCESS_TTL_SECONDS');
  }

  private getRefreshTtlSeconds() {
    return this.configService.getOrThrow<number>('JWT_REFRESH_TTL_SECONDS');
  }

  private getRefreshExpiresAt() {
    return new Date(Date.now() + this.getRefreshTtlSeconds() * 1000);
  }

  private formatAuthResponse(
    userId: string,
    role: UserRole,
    email: string,
    tokens: AuthTokens,
  ) {
    return {
      user: {
        id: userId,
        role,
        email,
      },
      ...tokens,
    };
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
