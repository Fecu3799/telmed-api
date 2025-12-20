import { ApiProperty } from '@nestjs/swagger';
import { UserRole, UserStatus } from '@prisma/client';

export class UserMeDto {
  @ApiProperty({ example: 'b9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  id!: string;

  @ApiProperty({ example: 'doc1@test.com' })
  email!: string;

  @ApiProperty({ example: 'doctor', enum: UserRole })
  role!: UserRole;

  @ApiProperty({ example: 'active', enum: UserStatus })
  status!: UserStatus;

  @ApiProperty({ example: 'Dra. Maria Lopez', required: false })
  displayName?: string | null;

  @ApiProperty({ example: '2025-01-01T12:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2025-01-01T12:00:00.000Z' })
  updatedAt!: string;
}
