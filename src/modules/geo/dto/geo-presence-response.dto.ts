import { ApiProperty } from '@nestjs/swagger';

export class GeoPresenceResponseDto {
  @ApiProperty({ example: 'online' })
  status!: 'online';

  @ApiProperty({ example: 60 })
  ttlSeconds!: number;
}

export class GeoPresenceOfflineResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;
}
