import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class PatientProfilePutDto {
  @ApiProperty({ example: 'Juan' })
  @IsString()
  @MinLength(1)
  firstName!: string;

  @ApiProperty({ example: 'Perez' })
  @IsString()
  @MinLength(1)
  lastName!: string;

  @ApiPropertyOptional({ example: '+54 11 5555 5555' })
  @IsOptional()
  @IsString()
  phone?: string | null;
}
