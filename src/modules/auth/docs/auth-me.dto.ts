import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class AuthMeDto {
  @ApiProperty({ example: 'b9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a' })
  id!: string;

  @ApiProperty({ example: 'doctor', enum: UserRole })
  role!: UserRole;

  @ApiProperty({
    example: 'b9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a',
    required: false,
  })
  sessionId?: string;

  @ApiProperty({ example: true })
  hasPatientIdentity!: boolean;

  @ApiProperty({ example: ['id', 'role'], required: false })
  rawUserKeys?: string[];
}
