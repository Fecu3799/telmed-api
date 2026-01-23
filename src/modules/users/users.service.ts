import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { UpdateMeDto } from './dto/update-me.dto';

/**
 * Read/Update current user.
 * - Encapsula las operaciones "self-service" del usuario sobre la tabla users.
 *
 * How it works:
 * - getMe: findUnique por id y devuelve un select minimal de user.
 * - updateMe(userId, dto): valida que displayName venga definido; actualiza solo displayName
 */

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        displayName: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async updateMe(userId: string, dto: UpdateMeDto) {
    if (dto.displayName === undefined) {
      throw new UnprocessableEntityException('displayName is required');
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        displayName: dto.displayName,
      },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        displayName: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return user;
  }
}
