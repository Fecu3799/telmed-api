import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClinicalNoteFormatController } from './clinical-note-format.controller';
import { ClinicalNoteFormatService } from './clinical-note-format.service';
import { ClinicalNoteFormatProcessor } from './clinical-note-format.processor';
import { DummyFormatterProvider } from './dummy-formatter.provider';
import { FormatterProviderFactory } from './formatter-provider.factory';
import { FORMAT_JOB_EVENTS_PUBLISHER } from './format-job-events.types';
import { RedisFormatJobEventsPublisher } from './redis-format-job-events.publisher';
import { RedisFormatJobEventsSubscriber } from './redis-format-job-events.subscriber';
import { ConsultationsModule } from '../consultations/consultations.module';

/**
 * Clinical note format jobs module.
 * What it does:
 * - Manages format jobs for clinical episode final notes with BullMQ queue.
 * How it works:
 * - Exposes endpoints to create/get jobs, processes them asynchronously, emits Socket.IO events.
 * Gotchas:
 * - Uses DummyFormatterProvider by default; can be swapped for LLM provider later.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.getOrThrow<string>('REDIS_URL');
        // BullMQ with ioredis accepts connection string directly
        // Parse URL to extract host/port for connection object
        try {
          const url = new URL(redisUrl);
          return {
            connection: {
              host: url.hostname,
              port: parseInt(url.port || '6379', 10),
            },
          };
        } catch {
          // Fallback: assume it's a host:port string
          const [host, port] = redisUrl.split(':');
          return {
            connection: {
              host: host || 'localhost',
              port: parseInt(port || '6379', 10),
            },
          };
        }
      },
    }),
    BullModule.registerQueueAsync({
      name: 'clinical-note-format',
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const maxAttempts =
          configService.get<number>('CLINICAL_NOTE_FORMAT_MAX_ATTEMPTS') ?? 3;
        const backoffMs =
          configService.get<number>('CLINICAL_NOTE_FORMAT_BACKOFF_MS') ?? 5000;
        return {
          defaultJobOptions: {
            attempts: maxAttempts,
            backoff: {
              type: 'exponential',
              delay: backoffMs, // Configurable backoff delay
            },
          },
        };
      },
    }),
    ConsultationsModule,
  ],
  controllers: [ClinicalNoteFormatController],
  providers: [
    ClinicalNoteFormatService,
    ClinicalNoteFormatProcessor,
    DummyFormatterProvider,
    FormatterProviderFactory,
    RedisFormatJobEventsPublisher,
    RedisFormatJobEventsSubscriber,
    {
      provide: 'FormatterProvider',
      useFactory: (factory: FormatterProviderFactory) => factory.create(),
      inject: [FormatterProviderFactory],
    },
    {
      provide: FORMAT_JOB_EVENTS_PUBLISHER,
      useExisting: RedisFormatJobEventsPublisher,
    },
  ],
  exports: [ClinicalNoteFormatService],
})
export class ClinicalNoteFormatModule {}
