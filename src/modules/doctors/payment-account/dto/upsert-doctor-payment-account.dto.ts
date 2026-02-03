import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Upsert request for dev payment account.
 * What it does:
 * - Validates the DEV label used to simulate a connected account.
 */
export class UpsertDoctorPaymentAccountDto {
  @ApiProperty({ example: 'mp-dev-seller-1', minLength: 3, maxLength: 64 })
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  devLabel!: string;
}
