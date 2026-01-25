import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateClinicalEpisodeAddendumDto {
  @ApiProperty({ example: 'Addendum title' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ example: 'Additional clinical notes' })
  @IsString()
  body!: string;
}
