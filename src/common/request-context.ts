import { AsyncLocalStorage } from 'async_hooks';

export type RequestContext = {
  traceId?: string;
};

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext(context: RequestContext, callback: () => void) {
  storage.run(context, callback);
}

export function getTraceId(): string | undefined {
  return storage.getStore()?.traceId;
}
