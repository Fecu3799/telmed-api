import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ConsultationMessagesQueryDto {
  @ApiPropertyOptional({ example: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    example:
      'eyJjcmVhdGVkQXQiOiIyMDI1LTAxLTA1VDE0OjAwOjAwLjAwMFoiLCJpZCI6Im0xIn0',
  })
  @IsOptional()
  @IsString()
  cursor?: string;
}
