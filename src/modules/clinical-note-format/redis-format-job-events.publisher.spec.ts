import { RedisFormatJobEventsPublisher } from './redis-format-job-events.publisher';
import { FORMAT_JOB_EVENTS_CHANNEL } from './format-job-events.types';
import type { RedisService } from '../../infra/redis/redis.service';

describe('RedisFormatJobEventsPublisher', () => {
  it('publishes payloads to the configured channel', async () => {
    const publish = jest.fn().mockResolvedValue(1);
    const redisService = {
      getClient: () => ({ publish }),
    } as unknown as RedisService;

    const publisher = new RedisFormatJobEventsPublisher(redisService);

    const payload = {
      formatJobId: 'job-1',
      consultationId: 'consult-1',
      finalNoteId: 'note-1',
      status: 'completed' as const,
      traceId: 'trace-1',
    };

    await publisher.publish(payload);

    expect(publish).toHaveBeenCalledWith(
      FORMAT_JOB_EVENTS_CHANNEL,
      JSON.stringify(payload),
    );
  });
});
