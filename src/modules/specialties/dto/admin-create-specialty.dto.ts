import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
} from 'class-validator';

export class AdminCreateSpecialtyDto {
  @ApiProperty({ example: 'Cardiologia' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ example: 'cardiologia' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @MinLength(1)
  @Matches(/^[a-z0-9-]+$/)
  slug!: string;

  @ApiProperty({ example: 0, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
