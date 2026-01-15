import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { LocationDto } from '../../doctors/profile/dto/location.dto';

export class GeoEmergencyCreateDto {
  @ApiProperty({
    example: [
      'd9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a',
      'a1b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a',
    ],
  })
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsUUID('4', { each: true })
  doctorIds!: string[];

  @ApiProperty({ type: LocationDto })
  @ValidateNested()
  @Type(() => LocationDto)
  patientLocation!: LocationDto;

  @ApiPropertyOptional({ example: 'Dolor fuerte en el pecho' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  note?: string;
}
