import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class DoctorSpecialtiesPutDto {
  @ApiProperty({
    example: ['b9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a'],
  })
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  specialtyIds!: string[];
}
