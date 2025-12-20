import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { Actor } from '../../common/types/actor.type';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';

const AUTH_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

type RequestWithActor = Request & { user?: Actor };

@Controller('auth')
@Throttle(AUTH_THROTTLE)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: RequestWithActor) {
    return this.authService.register(dto, req.ip, req.get('user-agent'));
  }

  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: RequestWithActor) {
    return this.authService.login(dto, req.ip, req.get('user-agent'));
  }

  @Post('refresh')
  async refresh(@Body() dto: RefreshDto, @Req() req: RequestWithActor) {
    return this.authService.refresh(dto, req.ip, req.get('user-agent'));
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Body() dto: LogoutDto, @CurrentUser() actor: Actor) {
    await this.authService.logout(dto.refreshToken, actor.id);
    return { success: true };
  }
}
