import { ApiProperty } from '@nestjs/swagger';

export class GeoEmergencyRequestDto {
  @ApiProperty({ example: 'd9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  doctorId!: string;

  @ApiProperty({ example: 'e9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  queueItemId!: string;
}

export class GeoEmergencyResponseDto {
  @ApiProperty({ example: 'c9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  groupId!: string;

  @ApiProperty({ type: [GeoEmergencyRequestDto] })
  requests!: GeoEmergencyRequestDto[];
}
