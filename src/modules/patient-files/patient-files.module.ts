import { Module } from '@nestjs/common';
import { PatientFilesController } from './patient-files.controller';
import { PatientFilesService } from './patient-files.service';
import { PatientFilesAccessService } from './patient-files-access.service';

@Module({
  controllers: [PatientFilesController],
  providers: [PatientFilesService, PatientFilesAccessService],
  exports: [PatientFilesService, PatientFilesAccessService],
})
export class PatientFilesModule {}
