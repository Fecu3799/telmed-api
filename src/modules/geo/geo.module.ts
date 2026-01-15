import { Module, forwardRef } from '@nestjs/common';
import { ConsultationQueueModule } from '../consultation-queue/consultation-queue.module';
import { GeoController } from './geo.controller';
import { GeoEmergencyCoordinator } from './geo-emergency-coordinator.service';
import { GeoService } from './geo.service';
import { SubscriptionPlanResolver } from './subscription-plan-resolver.service';

@Module({
  imports: [forwardRef(() => ConsultationQueueModule)],
  controllers: [GeoController],
  providers: [GeoService, SubscriptionPlanResolver, GeoEmergencyCoordinator],
  exports: [GeoEmergencyCoordinator],
})
export class GeoModule {}
