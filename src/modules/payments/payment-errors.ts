import { ConflictException } from '@nestjs/common';
import type { PaymentKind } from '@prisma/client';

export function buildPaymentWindowExpiredError(input?: {
  paymentId?: string | null;
  kind?: PaymentKind | null;
}) {
  return new ConflictException({
    detail: 'Payment window expired',
    extensions: {
      code: 'payment_window_expired',
      paymentId: input?.paymentId ?? null,
      kind: input?.kind ?? null,
    },
  });
}
