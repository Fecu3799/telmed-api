import { ApiProperty } from '@nestjs/swagger';

export class SpecialtyDeleteDto {
  @ApiProperty({ example: true })
  success!: boolean;
}
