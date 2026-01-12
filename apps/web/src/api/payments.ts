import { http } from './http';
import { endpoints } from './endpoints';

export interface PaymentStatusResponse {
  queueItemId: string;
  paymentStatus: 'paid' | 'pending' | 'failed' | 'expired';
  provider: string;
  mpPaymentId?: string | null;
  providerStatus?: string | null;
  providerStatusDetail?: string | null;
  lastProviderCheckAt?: string | null;
  userFacingState:
    | 'paid'
    | 'provider_processing'
    | 'rejected_or_failed'
    | 'expired';
  userFacingMessage: {
    title: string;
    description: string;
    canRetry: boolean;
  };
  nextActions?: Array<{
    type: string;
    retryAfterSeconds: number;
  }>;
}
