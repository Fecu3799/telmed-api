import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ProblemDetailsDto } from '../../common/docs/problem-details.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { Actor } from '../../common/types/actor.type';
import { UpdateMeDto } from './dto/update-me.dto';
import { UserMeDto } from './docs/user-me.dto';
import { UsersService } from './users.service';

/**
 * Current user endpoints
 * - Expone endpoints para que el usuario autenticado consulte/edite su propio perfil.
 *
 * How it works:
 * - Protegido con JwtAuthGuard y access-token.
 * - GET /users/me devuelve el "me" desde UsersService.getMe(actor.id).
 * - PATCH /users/me permite actualizar  displayName vía UsersService.updateMe(actor.id, dto).
 */

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current authenticated user' })
  @ApiOkResponse({ type: UserMeDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async me(@CurrentUser() actor: Actor) {
    return this.usersService.getMe(actor.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user basic profile' })
  @ApiBody({ type: UpdateMeDto })
  @ApiOkResponse({ type: UserMeDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async updateMe(@CurrentUser() actor: Actor, @Body() dto: UpdateMeDto) {
    return this.usersService.updateMe(actor.id, dto);
  }
}
