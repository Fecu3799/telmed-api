import { calculatePlatformFee, COMMISSION_RATE_BPS } from './fee-calculator';

describe('calculatePlatformFee', () => {
  it('computes platform fee and total with rounding', () => {
    const result = calculatePlatformFee(120000);
    expect(result).toEqual({
      commissionRateBps: COMMISSION_RATE_BPS,
      platformFeeCents: 18000,
      totalChargedCents: 138000,
    });
  });

  it('rounds fractional fees to the nearest cent', () => {
    const result = calculatePlatformFee(333);
    expect(result.platformFeeCents).toBe(50);
    expect(result.totalChargedCents).toBe(383);
  });

  it('throws for negative or non-integer values', () => {
    expect(() => calculatePlatformFee(-1)).toThrow(
      'grossAmountCents must be a non-negative integer',
    );
    expect(() => calculatePlatformFee(10.5)).toThrow(
      'grossAmountCents must be a non-negative integer',
    );
  });
});
