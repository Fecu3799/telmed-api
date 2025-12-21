import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { ProblemDetailsDto } from '../../common/docs/problem-details.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { Actor } from '../../common/types/actor.type';
import { AuthService } from './auth.service';
import { AuthMeDto } from './docs/auth-me.dto';
import { AuthResponseDto } from './docs/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { LogoutResponseDto } from './docs/logout-response.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RefreshResponseDto } from './docs/refresh-response.dto';
import { RegisterDto } from './dto/register.dto';

const AUTH_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

type RequestWithActor = Request & { user?: Actor };

@ApiTags('auth')
@Controller('auth')
// Tight rate limit for auth endpoints to reduce abuse.
@Throttle(AUTH_THROTTLE)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user (doctor or patient)' })
  @ApiBody({ type: RegisterDto })
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async register(@Body() dto: RegisterDto, @Req() req: RequestWithActor) {
    return this.authService.register(dto, req.ip, req.get('user-agent'));
  }

  @Post('login')
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async login(@Body() dto: LoginDto, @Req() req: RequestWithActor) {
    return this.authService.login(dto, req.ip, req.get('user-agent'));
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Rotate refresh token and return new tokens' })
  @ApiBody({ type: RefreshDto })
  @ApiOkResponse({ type: RefreshResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async refresh(@Body() dto: RefreshDto, @Req() req: RequestWithActor) {
    return this.authService.refresh(dto, req.ip, req.get('user-agent'));
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Revoke a refresh session' })
  @ApiBody({ type: LogoutDto })
  @ApiOkResponse({ type: LogoutResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async logout(@Body() dto: LogoutDto, @CurrentUser() actor: Actor) {
    await this.authService.logout(dto.refreshToken, actor.id);
    return { success: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Return current authenticated actor' })
  @ApiOkResponse({ type: AuthMeDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  getMe(@CurrentUser() actor: Actor, @Req() req: RequestWithActor) {
    const response: Record<string, unknown> = { ...actor };
    if (
      process.env.NODE_ENV === 'test' ||
      String(process.env.DEBUG_AUTH).toLowerCase() === 'true'
    ) {
      response.rawUserKeys = req.user ? Object.keys(req.user) : [];
    }
    return response;
  }
}
