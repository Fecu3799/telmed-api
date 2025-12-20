import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';

export class RegisterDto {
  @ApiProperty({ example: 'doc1@test.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Passw0rd!123' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: 'doctor', enum: UserRole })
  @IsEnum(UserRole)
  role!: UserRole;
}
