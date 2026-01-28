export type FormatJobEventStatus = 'completed' | 'failed';

export type FormatJobEventPayload = {
  formatJobId: string;
  consultationId: string;
  episodeId?: string | null;
  finalNoteId: string;
  status: FormatJobEventStatus;
  traceId?: string | null;
  error?: {
    code: string;
    message?: string | null;
  };
};

export interface FormatJobEventsPublisher {
  publish(payload: FormatJobEventPayload): Promise<void>;
}

export const FORMAT_JOB_EVENTS_PUBLISHER = 'FORMAT_JOB_EVENTS_PUBLISHER';
export const FORMAT_JOB_EVENTS_CHANNEL = 'clinical-note-format-events';
