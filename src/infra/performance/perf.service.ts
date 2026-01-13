import { Injectable } from '@nestjs/common';

export interface SlowRequestSample {
  ts: number;
  method: string;
  path: string;
  routeKey: string;
  statusCode: number;
  durationMs: number;
  traceId: string | null;
  actorId: string | null;
  userAgent?: string;
  ip?: string;
}

export interface SlowQuerySample {
  ts: number;
  model: string;
  action: string;
  durationMs: number;
  traceId: string | null;
  whereSummary?: string;
  error?: string;
}

interface RouteStats {
  routeKey: string;
  count: number;
  max: number;
  totalMs: number;
  lastTs: number;
  lastDuration: number;
  durations: number[]; // Ring buffer for percentiles
}

interface QueryStats {
  queryKey: string; // model:action
  count: number;
  max: number;
  totalMs: number;
  lastTs: number;
  durations: number[];
}

@Injectable()
export class PerfService {
  private slowRequests: SlowRequestSample[] = [];
  private slowQueries: SlowQuerySample[] = [];
  private routeStatsMap = new Map<string, RouteStats>();
  private queryStatsMap = new Map<string, QueryStats>();
  private maxSlowRequests: number;
  private maxSlowQueries: number;
  private topN: number;

  constructor(maxSlowRequests = 200, maxSlowQueries = 200, topN = 20) {
    this.maxSlowRequests = maxSlowRequests;
    this.maxSlowQueries = maxSlowQueries;
    this.topN = topN;
  }

  recordSlowRequest(sample: SlowRequestSample): void {
    // Add to samples array (FIFO if exceeds max)
    this.slowRequests.push(sample);
    if (this.slowRequests.length > this.maxSlowRequests) {
      this.slowRequests.shift();
    }

    // Update route stats
    const routeKey = sample.routeKey;
    const existing = this.routeStatsMap.get(routeKey);
    const durations = existing?.durations ?? [];
    durations.push(sample.durationMs);
    // Keep ring buffer of ~200 samples per route
    if (durations.length > 200) {
      durations.shift();
    }

    this.routeStatsMap.set(routeKey, {
      routeKey,
      count: (existing?.count ?? 0) + 1,
      max: Math.max(existing?.max ?? 0, sample.durationMs),
      totalMs: (existing?.totalMs ?? 0) + sample.durationMs,
      lastTs: sample.ts,
      lastDuration: sample.durationMs,
      durations,
    });
  }

  recordSlowQuery(sample: SlowQuerySample): void {
    // Add to samples array (FIFO if exceeds max)
    this.slowQueries.push(sample);
    if (this.slowQueries.length > this.maxSlowQueries) {
      this.slowQueries.shift();
    }

    // Update query stats
    const queryKey = `${sample.model}:${sample.action}`;
    const existing = this.queryStatsMap.get(queryKey);
    const durations = existing?.durations ?? [];
    durations.push(sample.durationMs);
    if (durations.length > 200) {
      durations.shift();
    }

    this.queryStatsMap.set(queryKey, {
      queryKey,
      count: (existing?.count ?? 0) + 1,
      max: Math.max(existing?.max ?? 0, sample.durationMs),
      totalMs: (existing?.totalMs ?? 0) + sample.durationMs,
      lastTs: sample.ts,
      durations,
    });
  }

  getSlowRequests(limit = 50): SlowRequestSample[] {
    return this.slowRequests.slice(-limit).reverse();
  }

  getSlowQueries(limit = 50): SlowQuerySample[] {
    return this.slowQueries.slice(-limit).reverse();
  }

  getTopRoutes(): Array<{
    routeKey: string;
    count: number;
    avg: number;
    p50: number;
    p95: number;
    max: number;
    lastTs: number;
  }> {
    const routes = Array.from(this.routeStatsMap.values());
    const withPercentiles = routes.map((stats) => {
      const sorted = [...stats.durations].sort((a, b) => a - b);
      const p50 = this.percentile(sorted, 0.5);
      const p95 = this.percentile(sorted, 0.95);

      return {
        routeKey: stats.routeKey,
        count: stats.count,
        avg: stats.totalMs / stats.count,
        p50,
        p95,
        max: stats.max,
        lastTs: stats.lastTs,
      };
    });

    // Sort by p95 descending
    withPercentiles.sort((a, b) => b.p95 - a.p95);

    return withPercentiles.slice(0, this.topN);
  }

  getTopQueries(): Array<{
    queryKey: string;
    count: number;
    avg: number;
    p50: number;
    p95: number;
    max: number;
    lastTs: number;
  }> {
    const queries = Array.from(this.queryStatsMap.values());
    const withPercentiles = queries.map((stats) => {
      const sorted = [...stats.durations].sort((a, b) => a - b);
      const p50 = this.percentile(sorted, 0.5);
      const p95 = this.percentile(sorted, 0.95);

      return {
        queryKey: stats.queryKey,
        count: stats.count,
        avg: stats.totalMs / stats.count,
        p50,
        p95,
        max: stats.max,
        lastTs: stats.lastTs,
      };
    });

    // Sort by max descending
    withPercentiles.sort((a, b) => b.max - a.max);

    return withPercentiles.slice(0, this.topN);
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    if (sorted.length === 1) return sorted[0];
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)] ?? 0;
  }

  clear(): void {
    this.slowRequests = [];
    this.slowQueries = [];
    this.routeStatsMap.clear();
    this.queryStatsMap.clear();
  }
}
