import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class PatientProfilePatchDto {
  @ApiPropertyOptional({ example: 'Juan' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Perez' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  lastName?: string;

  @ApiPropertyOptional({ example: '+54 11 5555 5555' })
  @IsOptional()
  @IsString()
  phone?: string | null;
}
