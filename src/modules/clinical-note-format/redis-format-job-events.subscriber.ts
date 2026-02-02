import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { RedisService } from '../../infra/redis/redis.service';
import { ConsultationRealtimeGateway } from '../consultations/consultation-realtime.gateway';
import {
  FORMAT_JOB_EVENTS_CHANNEL,
  type FormatJobEventPayload,
} from './format-job-events.types';

@Injectable()
export class RedisFormatJobEventsSubscriber
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RedisFormatJobEventsSubscriber.name);
  private subscriber: Redis | null = null;

  constructor(
    private readonly redis: RedisService,
    private readonly gateway: ConsultationRealtimeGateway,
  ) {}

  async onModuleInit() {
    if (
      process.env.APP_PROCESS_ROLE === 'worker' ||
      String(process.env.WORKERS_ENABLED).toLowerCase() === 'false' ||
      process.env.NODE_ENV === 'test' ||
      process.env.APP_ENV === 'test'
    ) {
      this.logger.log(
        JSON.stringify({
          event: 'format_job_events_subscriber_skipped',
          reason: 'disabled',
        }),
      );
      return;
    }

    this.subscriber = this.redis.getClient().duplicate();
    await this.subscriber.subscribe(FORMAT_JOB_EVENTS_CHANNEL);
    this.subscriber.on('message', this.handleMessage);

    this.logger.log(
      JSON.stringify({
        event: 'format_job_events_subscribed',
        channel: FORMAT_JOB_EVENTS_CHANNEL,
      }),
    );
  }

  async onModuleDestroy() {
    if (!this.subscriber) {
      return;
    }
    try {
      await this.subscriber.quit();
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'format_job_events_subscriber_disconnect_failed',
          error: String(error),
        }),
      );
    }
  }

  private handleMessage = (channel: string, message: string) => {
    if (channel !== FORMAT_JOB_EVENTS_CHANNEL) {
      return;
    }

    let payload: FormatJobEventPayload | null = null;
    try {
      payload = JSON.parse(message) as FormatJobEventPayload;
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'format_job_event_parse_failed',
          error: String(error),
        }),
      );
      return;
    }

    this.logger.log(
      JSON.stringify({
        event: 'format_job_event_received',
        formatJobId: payload.formatJobId,
        consultationId: payload.consultationId,
        status: payload.status,
        traceId: payload.traceId ?? null,
      }),
    );

    if (payload.status === 'completed') {
      this.gateway.emitFormatJobReady(
        payload.consultationId,
        payload.formatJobId,
        payload.finalNoteId,
        payload.traceId ?? null,
      );
      return;
    }

    if (payload.status === 'failed') {
      this.gateway.emitFormatJobFailed(
        payload.consultationId,
        payload.formatJobId,
        payload.error?.code ?? 'FORMAT_JOB_FAILED',
        payload.traceId ?? null,
      );
    }
  };
}
