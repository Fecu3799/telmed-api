import { http } from './http';
import { endpoints } from './endpoints';

export interface PaymentStatusResponse {
  queueItemId: string;
  paymentStatus: 'paid' | 'pending' | 'failed' | 'expired' | 'cancelled';
  provider: string;
  mpPaymentId?: string | null;
  providerStatus?: string | null;
  providerStatusDetail?: string | null;
  lastProviderCheckAt?: string | null;
  userFacingState:
    | 'paid'
    | 'provider_processing'
    | 'rejected_or_failed'
    | 'expired'
    | 'cancelled';
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

export type PaymentQuoteKind = 'appointment' | 'emergency';

export interface PaymentQuoteRequest {
  kind: PaymentQuoteKind;
  appointmentId?: string;
  queueItemId?: string;
}

export interface PaymentQuoteResponse {
  kind: PaymentQuoteKind;
  referenceId: string;
  doctorUserId: string;
  grossCents: number;
  platformFeeCents: number;
  totalChargedCents: number;
  currency: string;
  doctorDisplayName?: string | null;
  paymentDeadlineAt: string;
  timeLeftSeconds: number;
}

export async function getPaymentQuote(
  input: PaymentQuoteRequest,
): Promise<PaymentQuoteResponse> {
  return http<PaymentQuoteResponse>(endpoints.payments.quote, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
