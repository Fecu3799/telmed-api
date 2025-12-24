import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Max, Min } from 'class-validator';

export class LocationDto {
  @ApiProperty({ example: -34.6037 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({ example: -58.3816 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;
}
