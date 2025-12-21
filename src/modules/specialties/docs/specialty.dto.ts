import { ApiProperty } from '@nestjs/swagger';

export class SpecialtyDto {
  @ApiProperty({ example: 'b9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  id!: string;

  @ApiProperty({ example: 'Cardiologia' })
  name!: string;

  @ApiProperty({ example: true })
  isActive!: boolean;
}
