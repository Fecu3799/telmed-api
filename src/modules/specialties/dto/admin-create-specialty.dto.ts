import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class AdminCreateSpecialtyDto {
  @ApiProperty({ example: 'Cardiologia' })
  @IsString()
  @MinLength(1)
  name!: string;
}
