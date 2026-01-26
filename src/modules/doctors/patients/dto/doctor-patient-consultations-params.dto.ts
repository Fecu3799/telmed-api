import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * Doctor patient consultations route params.
 * What it does:
 * - Validates the patient user id parameter for doctor consultation listings.
 * How it works:
 * - Uses class-validator to enforce UUID format.
 * Gotchas:
 * - Invalid UUIDs will return 422 via the global validation pipe.
 */
export class DoctorPatientConsultationsParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  patientUserId!: string;
}
