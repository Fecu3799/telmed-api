import { ApiProperty } from '@nestjs/swagger';

export class LiveKitTokenDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  token!: string;

  @ApiProperty({ example: 'consultation_c9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  roomName!: string;

  @ApiProperty({ example: 'wss://your-livekit.cloud' })
  livekitUrl!: string;
}
