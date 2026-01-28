import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProblemDetailsDto {
  @ApiProperty({ example: 'about:blank' })
  type!: string;

  @ApiProperty({ example: 'UnprocessableEntity' })
  title!: string;

  @ApiProperty({ example: 422 })
  status!: number;

  @ApiProperty({ example: 'Validation failed' })
  detail!: string;

  @ApiProperty({ example: '/api/v1/auth/login' })
  instance!: string;

  @ApiPropertyOptional({
    description: 'Validation or domain errors keyed by field name.',
    example: { email: ['email must be an email'] },
  })
  errors?: Record<string, string[]> | string[];

  @ApiPropertyOptional({
    description: 'Additional metadata for the error (domain-specific).',
    example: { code: 'emergency_limit_reached', retryAfterSeconds: 3600 },
  })
  extensions?: Record<string, unknown>;
}
