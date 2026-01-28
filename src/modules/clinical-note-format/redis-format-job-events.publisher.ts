import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../infra/redis/redis.service';
import {
  FORMAT_JOB_EVENTS_CHANNEL,
  type FormatJobEventPayload,
  type FormatJobEventsPublisher,
} from './format-job-events.types';

@Injectable()
export class RedisFormatJobEventsPublisher implements FormatJobEventsPublisher {
  private readonly logger = new Logger(RedisFormatJobEventsPublisher.name);

  constructor(private readonly redis: RedisService) {}

  async publish(payload: FormatJobEventPayload): Promise<void> {
    const client = this.redis.getClient();
    await client.publish(FORMAT_JOB_EVENTS_CHANNEL, JSON.stringify(payload));

    this.logger.log(
      JSON.stringify({
        event: 'format_job_event_published',
        formatJobId: payload.formatJobId,
        consultationId: payload.consultationId,
        status: payload.status,
        traceId: payload.traceId ?? null,
      }),
    );
  }
}
