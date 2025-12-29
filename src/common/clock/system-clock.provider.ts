import type { Provider } from '@nestjs/common';
import { CLOCK, type Clock } from './clock';

export const systemClockProvider: Provider = {
  provide: CLOCK,
  useValue: {
    now: () => new Date(),
  } satisfies Clock,
};
