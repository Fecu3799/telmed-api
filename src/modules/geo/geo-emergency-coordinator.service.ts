import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConsultationQueueStatus } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { CLOCK, type Clock } from '../../common/clock/clock';

type GeoEmergencyGroup = {
  patientId: string;
  doctorIds: string[];
  queueItemIds: string[];
  status: 'pending' | 'accepted';
  createdAt: string;
  acceptedAt?: string;
  acceptedByDoctorId?: string;
  acceptedQueueItemId?: string;
  patientLocation?: { lat: number; lng: number };
  note?: string | null;
};

type GeoAcceptanceClaim = {
  groupId: string;
  groupKey: string;
  acceptedKey: string;
  ttlSeconds: number;
  group?: GeoEmergencyGroup | null;
};

@Injectable()
export class GeoEmergencyCoordinator {
  private readonly logger = new Logger(GeoEmergencyCoordinator.name);
  private readonly groupTtlSeconds = 15 * 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async reserveAcceptance(
    queueItemId: string,
  ): Promise<GeoAcceptanceClaim | null> {
    const client = this.redis.getClient();
    const mappingKey = this.requestMappingKey(queueItemId);
    const groupId = await client.get(mappingKey);
    if (!groupId) {
      return null;
    }

    const groupKey = this.groupKey(groupId);
    const acceptedKey = this.acceptedKey(groupId);
    const ttl = await client.ttl(groupKey);
    const ttlSeconds = ttl > 0 ? ttl : this.groupTtlSeconds;

    // Ensure only one doctor can accept within the same group.
    const claimed = (await client.call(
      'SET',
      acceptedKey,
      queueItemId,
      'NX',
      'EX',
      String(ttlSeconds),
    )) as string | null;
    if (claimed !== 'OK') {
      throw new ConflictException('Request already accepted by another doctor');
    }

    const groupRaw = await client.get(groupKey);
    const group = groupRaw ? this.parseGroup(groupRaw) : null;

    return { groupId, groupKey, acceptedKey, ttlSeconds, group };
  }

  async finalizeAcceptance(
    claim: GeoAcceptanceClaim,
    acceptedQueueItemId: string,
    acceptedByDoctorId: string,
  ) {
    const now = this.clock.now().toISOString();

    if (claim.group) {
      const updated: GeoEmergencyGroup = {
        ...claim.group,
        status: 'accepted',
        acceptedAt: now,
        acceptedByDoctorId,
        acceptedQueueItemId,
      };

      // Best-effort update of group metadata with same TTL.
      const client = this.redis.getClient();
      await client.set(
        claim.groupKey,
        JSON.stringify(updated),
        'EX',
        claim.ttlSeconds,
      );

      const siblingIds = claim.group.queueItemIds.filter(
        (id) => id !== acceptedQueueItemId,
      );
      if (siblingIds.length > 0) {
        await this.cancelSiblingRequests(siblingIds, acceptedByDoctorId);
      }
    }
  }

  async releaseAcceptance(claim: GeoAcceptanceClaim) {
    const client = this.redis.getClient();
    await client.del(claim.acceptedKey);
  }

  private async cancelSiblingRequests(
    queueItemIds: string[],
    acceptedByDoctorId: string,
  ) {
    // Keep cancellation minimal and idempotent to avoid race conflicts.
    await this.prisma.consultationQueueItem.updateMany({
      where: {
        id: { in: queueItemIds },
        status: ConsultationQueueStatus.queued,
      },
      data: {
        status: ConsultationQueueStatus.cancelled,
        cancelledAt: this.clock.now(),
        cancelledBy: acceptedByDoctorId,
        reason: 'Cancelled due to another doctor acceptance',
      },
    });
  }

  private parseGroup(raw: string): GeoEmergencyGroup | null {
    try {
      return JSON.parse(raw) as GeoEmergencyGroup;
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'geo_group_parse_failed',
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return null;
    }
  }

  groupKey(groupId: string) {
    return `geo:emergency:group:${groupId}`;
  }

  acceptedKey(groupId: string) {
    return `geo:emergency:group:${groupId}:accepted`;
  }

  requestMappingKey(queueItemId: string) {
    return `geo:emergency:request:${queueItemId}`;
  }
}
