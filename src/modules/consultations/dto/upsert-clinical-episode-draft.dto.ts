import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UpsertClinicalEpisodeDraftDto {
  @ApiProperty({ example: 'Draft summary' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ example: 'Draft clinical notes' })
  @IsString()
  body!: string;
}
