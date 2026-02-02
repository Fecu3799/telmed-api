import { Injectable, OnModuleDestroy } from '@nestjs/common';
import {
  AppointmentStatus,
  ConsultationQueueStatus,
  ConsultationStatus,
  UserRole,
} from '@prisma/client';
import { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';

type JobCounts = {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
};

@Injectable()
export class AdminMetricsService implements OnModuleDestroy {
  private readonly formatQueue: Queue;
  private readonly queueConnection: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    const redisConnection = this.redis.getClient().duplicate();
    this.queueConnection = redisConnection;
    this.formatQueue = new Queue('clinical-note-format', {
      connection: redisConnection,
    });
  }

  async getOverview() {
    const [
      usersTotal,
      usersByRole,
      doctorsTotal,
      doctorProfiles,
      doctorSchedulingConfigs,
      patientsTotal,
      patientsWithIdentity,
      specialtiesTotal,
      specialtiesActive,
      specialtiesInactive,
      appointmentTotal,
      appointmentByStatus,
      consultationTotal,
      consultationByStatus,
      queueTotal,
      queueByStatus,
      clinicalEpisodesTotal,
      clinicalNotesTotal,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.groupBy({
        by: ['role'],
        _count: { role: true },
      }),
      this.prisma.user.count({ where: { role: UserRole.doctor } }),
      this.prisma.doctorProfile.count(),
      this.prisma.doctorSchedulingConfig.count(),
      this.prisma.user.count({ where: { role: UserRole.patient } }),
      this.prisma.patient.count(),
      this.prisma.specialty.count(),
      this.prisma.specialty.count({ where: { isActive: true } }),
      this.prisma.specialty.count({ where: { isActive: false } }),
      this.prisma.appointment.count(),
      this.prisma.appointment.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
      this.prisma.consultation.count(),
      this.prisma.consultation.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
      this.prisma.consultationQueueItem.count(),
      this.prisma.consultationQueueItem.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
      this.prisma.clinicalEpisode.count(),
      this.prisma.clinicalEpisodeNote.count(),
    ]);

    const byRole = usersByRole.reduce<Record<string, number>>((acc, row) => {
      acc[row.role] = row._count.role;
      return acc;
    }, {});

    const appointmentStatuses = appointmentByStatus.reduce<
      Record<AppointmentStatus, number>
    >(
      (acc, row) => {
        acc[row.status] = row._count.status;
        return acc;
      },
      {} as Record<AppointmentStatus, number>,
    );

    const consultationStatuses = consultationByStatus.reduce<
      Record<ConsultationStatus, number>
    >(
      (acc, row) => {
        acc[row.status] = row._count.status;
        return acc;
      },
      {} as Record<ConsultationStatus, number>,
    );

    const queueStatuses = queueByStatus.reduce<
      Record<ConsultationQueueStatus, number>
    >(
      (acc, row) => {
        acc[row.status] = row._count.status;
        return acc;
      },
      {} as Record<ConsultationQueueStatus, number>,
    );

    return {
      users: {
        total: usersTotal,
        byRole,
      },
      doctors: {
        total: doctorsTotal,
        withProfile: doctorProfiles,
        withSchedulingConfig: doctorSchedulingConfigs,
      },
      patients: {
        total: patientsTotal,
        withIdentity: patientsWithIdentity,
      },
      specialties: {
        total: specialtiesTotal,
        active: specialtiesActive,
        inactive: specialtiesInactive,
      },
      appointments: {
        total: appointmentTotal,
        byStatus: appointmentStatuses,
      },
      consultations: {
        total: consultationTotal,
        byStatus: consultationStatuses,
      },
      queue: {
        total: queueTotal,
        byStatus: queueStatuses,
      },
      clinical: {
        episodes: clinicalEpisodesTotal,
        notes: clinicalNotesTotal,
      },
    };
  }

  async getHealth() {
    const now = new Date().toISOString();
    const checks: Record<string, { ok: boolean; latencyMs?: number }> = {};

    const dbStart = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.db = { ok: true, latencyMs: Date.now() - dbStart };
    } catch {
      checks.db = { ok: false, latencyMs: Date.now() - dbStart };
    }

    const redisClient = this.redis.getClient();
    const redisStart = Date.now();
    try {
      await this.withTimeout(redisClient.ping(), 1000);
      checks.redis = { ok: true, latencyMs: Date.now() - redisStart };
    } catch {
      checks.redis = { ok: false, latencyMs: Date.now() - redisStart };
    }

    return {
      ok: Object.values(checks).every((check) => check.ok),
      now,
      checks,
    };
  }

  async getJobs() {
    try {
      const counts = (await this.formatQueue.getJobCounts(
        'waiting',
        'active',
        'completed',
        'failed',
        'delayed',
      )) as JobCounts;

      const failedJobs = await this.formatQueue.getFailed(0, 9);

      return {
        queues: [
          {
            name: 'clinical-note-format',
            counts,
            recentFailed: failedJobs.map((job) => ({
              id: String(job.id),
              name: job.name,
              failedReason: job.failedReason ?? null,
              timestamp: job.timestamp ?? null,
            })),
          },
        ],
      };
    } catch {
      return { queues: [], note: 'job system not available' };
    }
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
    let timeout: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  async onModuleDestroy() {
    try {
      await this.formatQueue.close();
    } catch {
      // Ignore close errors during shutdown.
    }
    try {
      await this.queueConnection.quit();
    } catch {
      // Ignore redis close errors during shutdown.
    }
  }
}
