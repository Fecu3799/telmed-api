import { Module } from '@nestjs/common';
import { PatientsIdentityController } from './patients-identity.controller';
import { PatientsIdentityService } from './patients-identity.service';

@Module({
  controllers: [PatientsIdentityController],
  providers: [PatientsIdentityService],
  exports: [PatientsIdentityService],
})
export class PatientsIdentityModule {}
