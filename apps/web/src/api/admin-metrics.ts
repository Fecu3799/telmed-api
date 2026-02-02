import { http } from './http';
import { endpoints } from './endpoints';

export type AdminMetricsOverview = {
  users: {
    total: number;
    byRole: Record<string, number>;
  };
  doctors?: {
    total: number;
    withProfile: number;
    withSchedulingConfig: number;
  };
  patients?: {
    total: number;
    withIdentity: number;
  };
  specialties?: {
    total: number;
    active: number;
    inactive: number;
  };
  appointments?: {
    total: number;
    byStatus?: Record<string, number>;
  };
  consultations?: {
    total: number;
    byStatus?: Record<string, number>;
  };
  queue?: {
    total: number;
    byStatus?: Record<string, number>;
  };
  clinical?: {
    episodes: number;
    notes: number;
  };
};

export type AdminMetricsHealth = {
  ok: boolean;
  now: string;
  checks: {
    db: { ok: boolean; latencyMs?: number };
    redis?: { ok: boolean; latencyMs?: number };
  };
};

export type AdminMetricsJobs = {
  queues: Array<{
    name: string;
    counts: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      delayed: number;
    };
    recentFailed?: Array<{
      id: string;
      name: string;
      failedReason?: string | null;
      timestamp?: number | null;
    }>;
  }>;
  note?: string;
};

export async function getAdminMetricsOverview(): Promise<AdminMetricsOverview> {
  return http<AdminMetricsOverview>(endpoints.admin.metrics.overview);
}

export async function getAdminMetricsHealth(): Promise<AdminMetricsHealth> {
  return http<AdminMetricsHealth>(endpoints.admin.metrics.health);
}

export async function getAdminMetricsJobs(): Promise<AdminMetricsJobs> {
  return http<AdminMetricsJobs>(endpoints.admin.metrics.jobs);
}
