import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class AuthUserDto {
  @ApiProperty({ example: 'b9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  id!: string;

  @ApiProperty({ example: 'doctor', enum: UserRole })
  role!: UserRole;

  @ApiProperty({ example: 'doc1@test.com' })
  email!: string;
}
