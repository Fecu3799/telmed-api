import type { Clock } from '../../src/common/clock/clock';

export class FakeClock implements Clock {
  private _now: Date;

  constructor(initial: Date) {
    this._now = initial;
  }

  now(): Date {
    return new Date(this._now);
  }

  setNow(date: Date): void {
    this._now = date;
  }
}
