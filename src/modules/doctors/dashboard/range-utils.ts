import { UnprocessableEntityException } from '@nestjs/common';

export const DASHBOARD_RANGES = ['7d', '30d', 'ytd'] as const;
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

/**
 * Dashboard range parser.
 * What it does:
 * - Converts a range key into UTC date boundaries for queries.
 * How it works:
 * - Uses the provided `now` as the upper bound and subtracts days or resets to Jan 1 UTC.
 * Gotchas:
 * - Throws a 422 with `invalid_range` for unknown ranges to keep client errors explicit.
 */
export function parseRangeToDate(
  range: DashboardRange,
  now: Date = new Date(),
): { from: Date; to: Date } {
  const to = new Date(now.getTime());
  if (range === '7d') {
    return { from: new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000), to };
  }
  if (range === '30d') {
    return { from: new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000), to };
  }
  const year = to.getUTCFullYear();
  return { from: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)), to };
}

export function resolveDashboardRange(
  range: string | undefined,
  now: Date = new Date(),
): { range: DashboardRange; from: Date; to: Date } {
  const resolved = (range ?? '30d') as DashboardRange;
  if (!DASHBOARD_RANGES.includes(resolved)) {
    throw new UnprocessableEntityException({
      detail: 'Invalid range',
      extensions: { code: 'invalid_range' },
    });
  }
  const { from, to } = parseRangeToDate(resolved, now);
  return { range: resolved, from, to };
}
