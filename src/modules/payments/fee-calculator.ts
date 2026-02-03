/**
 * What is: Centralized platform fee calculator for TelMed payments.
 * How it works: Validates the gross amount, then uses bps math with rounding
 * to compute the platform fee and total charged to the patient.
 */
export const COMMISSION_RATE_BPS = 1500 as const;

export type PlatformFeeResult = {
  commissionRateBps: typeof COMMISSION_RATE_BPS;
  platformFeeCents: number;
  totalChargedCents: number;
};

export function calculatePlatformFee(
  grossAmountCents: number,
): PlatformFeeResult {
  if (!Number.isSafeInteger(grossAmountCents) || grossAmountCents < 0) {
    throw new Error('grossAmountCents must be a non-negative integer');
  }

  const platformFeeCents = Math.round(
    (grossAmountCents * COMMISSION_RATE_BPS) / 10000,
  );

  return {
    commissionRateBps: COMMISSION_RATE_BPS,
    platformFeeCents,
    totalChargedCents: grossAmountCents + platformFeeCents,
  };
}
