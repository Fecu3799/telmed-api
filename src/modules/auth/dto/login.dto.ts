import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'doc1@test.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Passw0rd!123' })
  @IsString()
  @MinLength(8)
  password!: string;
}
