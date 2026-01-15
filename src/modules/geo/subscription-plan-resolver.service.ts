import { Injectable } from '@nestjs/common';

export type SubscriptionPlan = 'FREE' | 'PREMIUM';

@Injectable()
export class SubscriptionPlanResolver {
  resolvePlan(_patientUserId: string): SubscriptionPlan {
    // Extension point: replace with real subscription lookup.
    return 'FREE';
  }
}
