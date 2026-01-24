import { Module } from '@nestjs/common';
import { PatientsClinicalProfileController } from './patients-clinical-profile.controller';
import { PatientsClinicalProfileService } from './patients-clinical-profile.service';
import { PatientsClinicalProfileAccessService } from './patients-clinical-profile-access.service';

@Module({
  controllers: [PatientsClinicalProfileController],
  providers: [
    PatientsClinicalProfileService,
    PatientsClinicalProfileAccessService,
  ],
})
export class PatientsClinicalProfileModule {}
