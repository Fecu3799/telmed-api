import { Global, Module } from '@nestjs/common';
import { systemClockProvider } from './system-clock.provider';

@Global()
@Module({
  providers: [systemClockProvider],
  exports: [systemClockProvider],
})
export class ClockModule {}
