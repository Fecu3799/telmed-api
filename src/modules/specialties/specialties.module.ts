import { Module } from '@nestjs/common';
import { AdminSpecialtiesController } from './admin-specialties.controller';
import { SpecialtiesController } from './specialties.controller';
import { SpecialtiesService } from './specialties.service';

@Module({
  controllers: [SpecialtiesController, AdminSpecialtiesController],
  providers: [SpecialtiesService],
})
export class SpecialtiesModule {}
