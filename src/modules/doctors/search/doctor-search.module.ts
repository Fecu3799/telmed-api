import { Module } from '@nestjs/common';
import { DoctorSearchController } from './doctor-search.controller';
import { DoctorSearchService } from './doctor-search.service';

@Module({
  controllers: [DoctorSearchController],
  providers: [DoctorSearchService],
})
export class DoctorSearchModule {}
