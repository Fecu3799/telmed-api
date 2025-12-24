import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  DoctorAvailabilityExceptionType,
  DoctorSchedulingConfig,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { AvailabilityExceptionCreateDto } from './dto/availability-exception-create.dto';
import { AvailabilityExceptionsQueryDto } from './dto/availability-exceptions-query.dto';
import { AvailabilityRuleInputDto } from './dto/availability-rule-input.dto';
import { AvailabilityRulesPutDto } from './dto/availability-rules-put.dto';
import { PublicAvailabilityQueryDto } from './dto/public-availability-query.dto';
import { AvailabilityWindowDto } from './dto/availability-window.dto';

const DEFAULT_CONFIG: DoctorSchedulingConfig = {
  userId: '',
  slotDurationMinutes: 60,
  leadTimeHours: 24,
  horizonDays: 60,
  timezone: 'America/Argentina/Buenos_Aires',
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

@Injectable()
export class DoctorAvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async listRules(userId: string) {
    return this.prisma.doctorAvailabilityRule.findMany({
      where: { userId },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }

  async replaceRules(userId: string, dto: AvailabilityRulesPutDto) {
    this.validateRules(dto.rules);

    await this.prisma.$transaction([
      this.prisma.doctorAvailabilityRule.deleteMany({ where: { userId } }),
      ...(dto.rules.length > 0
        ? [
            this.prisma.doctorAvailabilityRule.createMany({
              data: dto.rules.map((rule) => ({
                userId,
                dayOfWeek: rule.dayOfWeek,
                startTime: rule.startTime,
                endTime: rule.endTime,
                isActive: rule.isActive ?? true,
              })),
            }),
          ]
        : []),
    ]);

    return this.listRules(userId);
  }

  async listExceptions(userId: string, query: AvailabilityExceptionsQueryDto) {
    const fromDate = this.parseDate(query.from);
    const toDate = this.parseDate(query.to);
    if (fromDate > toDate) {
      throw new UnprocessableEntityException('from must be before to');
    }

    return this.prisma.doctorAvailabilityException.findMany({
      where: {
        userId,
        date: { gte: fromDate, lte: toDate },
      },
      orderBy: { date: 'asc' },
    });
  }

  async createException(userId: string, dto: AvailabilityExceptionCreateDto) {
    const date = this.parseDate(dto.date);

    if (dto.type === DoctorAvailabilityExceptionType.closed) {
      if (dto.customWindows && dto.customWindows.length > 0) {
        throw new UnprocessableEntityException(
          'customWindows is not allowed for closed exceptions',
        );
      }
    } else if (!dto.customWindows || dto.customWindows.length === 0) {
      throw new UnprocessableEntityException(
        'customWindows is required for custom exceptions',
      );
    }

    if (dto.customWindows) {
      this.validateWindows(dto.customWindows);
    }

    const customWindows = dto.customWindows
      ? dto.customWindows.map((window) => ({
          startTime: window.startTime,
          endTime: window.endTime,
        }))
      : null;

    return this.prisma.doctorAvailabilityException.create({
      data: {
        userId,
        date,
        type: dto.type,
        customWindows:
          (customWindows as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      },
    });
  }

  async deleteException(userId: string, id: string) {
    const result = await this.prisma.doctorAvailabilityException.deleteMany({
      where: { id, userId },
    });

    if (result.count === 0) {
      throw new NotFoundException('Exception not found');
    }
  }

  async getPublicAvailability(
    doctorUserId: string,
    query: PublicAvailabilityQueryDto,
  ) {
    const doctor = await this.prisma.user.findUnique({
      where: { id: doctorUserId },
      select: { id: true, role: true, status: true },
    });

    if (!doctor || doctor.role !== 'doctor' || doctor.status !== 'active') {
      throw new NotFoundException('Doctor not found');
    }

    const config = await this.getSchedulingConfig(doctorUserId);

    const from = this.parseDateTime(query.from);
    const to = this.parseDateTime(query.to);
    if (from >= to) {
      throw new UnprocessableEntityException('from must be before to');
    }

    const now = new Date();
    const minStart = new Date(
      now.getTime() + config.leadTimeHours * 3600 * 1000,
    );
    const maxEnd = new Date(
      now.getTime() + config.horizonDays * 24 * 3600 * 1000,
    );

    if (from < minStart || to > maxEnd) {
      throw new UnprocessableEntityException('from/to outside allowed range');
    }

    const rules = await this.prisma.doctorAvailabilityRule.findMany({
      where: { userId: doctorUserId, isActive: true },
    });

    const exceptions = await this.prisma.doctorAvailabilityException.findMany({
      where: {
        userId: doctorUserId,
        date: {
          gte: this.parseDate(this.formatDateInTimeZone(from, config.timezone)),
          lte: this.parseDate(this.formatDateInTimeZone(to, config.timezone)),
        },
      },
    });

    const rulesByDay = new Map<number, AvailabilityRuleInputDto[]>();
    for (const rule of rules) {
      const list = rulesByDay.get(rule.dayOfWeek) ?? [];
      list.push({
        dayOfWeek: rule.dayOfWeek,
        startTime: rule.startTime,
        endTime: rule.endTime,
        isActive: rule.isActive,
      });
      rulesByDay.set(rule.dayOfWeek, list);
    }

    const exceptionByDate = new Map<string, (typeof exceptions)[number]>();
    for (const exception of exceptions) {
      const dateKey = this.formatDate(exception.date);
      exceptionByDate.set(dateKey, exception);
    }

    const dateRange = this.getDateRange(
      this.formatDateInTimeZone(from, config.timezone),
      this.formatDateInTimeZone(to, config.timezone),
    );

    const slots: { startAt: string; endAt: string }[] = [];
    for (const dateStr of dateRange) {
      const exception = exceptionByDate.get(dateStr);
      if (
        exception &&
        exception.type === DoctorAvailabilityExceptionType.closed
      ) {
        continue;
      }

      const windows = this.resolveWindows(
        exception,
        rulesByDay.get(this.getWeekday(dateStr, config.timezone)) ?? [],
      );

      for (const window of windows) {
        const windowSlots = this.buildSlotsForWindow(
          dateStr,
          window,
          config,
          from,
          to,
          minStart,
        );
        slots.push(...windowSlots);
      }
    }

    return {
      items: slots,
      meta: {
        timezone: config.timezone,
        slotDurationMinutes: config.slotDurationMinutes,
        leadTimeHours: config.leadTimeHours,
        horizonDays: config.horizonDays,
      },
    };
  }

  private resolveWindows(
    exception:
      | { type: DoctorAvailabilityExceptionType; customWindows: unknown }
      | undefined,
    ruleWindows: AvailabilityRuleInputDto[],
  ): AvailabilityWindowDto[] {
    if (
      exception &&
      exception.type === DoctorAvailabilityExceptionType.custom
    ) {
      const custom = exception.customWindows as AvailabilityWindowDto[] | null;
      return custom ?? [];
    }
    return ruleWindows.map((rule) => ({
      startTime: rule.startTime,
      endTime: rule.endTime,
    }));
  }

  private validateRules(rules: AvailabilityRuleInputDto[]) {
    const grouped = new Map<number, AvailabilityRuleInputDto[]>();
    for (const rule of rules) {
      if (!this.isValidTimeRange(rule.startTime, rule.endTime)) {
        throw new UnprocessableEntityException('Invalid rule time range');
      }
      const list = grouped.get(rule.dayOfWeek) ?? [];
      list.push(rule);
      grouped.set(rule.dayOfWeek, list);
    }

    for (const list of grouped.values()) {
      const active = list.filter((rule) => rule.isActive ?? true);
      this.ensureNoOverlap(
        active.map((rule) => ({
          startTime: rule.startTime,
          endTime: rule.endTime,
        })),
      );
    }
  }

  private validateWindows(windows: AvailabilityWindowDto[]) {
    for (const window of windows) {
      if (!this.isValidTimeRange(window.startTime, window.endTime)) {
        throw new UnprocessableEntityException(
          'Invalid custom window time range',
        );
      }
    }
    this.ensureNoOverlap(windows);
  }

  private ensureNoOverlap(windows: AvailabilityWindowDto[]) {
    const sorted = [...windows].sort(
      (a, b) => this.toMinutes(a.startTime) - this.toMinutes(b.startTime),
    );

    for (let i = 1; i < sorted.length; i += 1) {
      const prev = sorted[i - 1];
      const current = sorted[i];
      if (this.toMinutes(current.startTime) < this.toMinutes(prev.endTime)) {
        throw new UnprocessableEntityException('Time windows overlap');
      }
    }
  }

  private isValidTimeRange(startTime: string, endTime: string) {
    return this.toMinutes(startTime) < this.toMinutes(endTime);
  }

  private toMinutes(time: string) {
    const [hour, minute] = time.split(':').map(Number);
    return hour * 60 + minute;
  }

  private formatDate(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private parseDate(dateStr: string) {
    const date = new Date(`${dateStr}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) {
      throw new UnprocessableEntityException('Invalid date');
    }
    return date;
  }

  private parseDateTime(dateStr: string) {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) {
      throw new UnprocessableEntityException('Invalid datetime');
    }
    return date;
  }

  async getSchedulingConfig(userId: string) {
    return this.prisma.doctorSchedulingConfig
      .findUnique({
        where: { userId },
      })
      .then((config) => config ?? { ...DEFAULT_CONFIG, userId });
  }

  async assertSlotAvailable(doctorUserId: string, startAt: Date, endAt: Date) {
    const availability = await this.getPublicAvailability(doctorUserId, {
      from: startAt.toISOString(),
      to: endAt.toISOString(),
    });

    const startIso = startAt.toISOString();
    const endIso = endAt.toISOString();
    const matches = availability.items.some(
      (slot) => slot.startAt === startIso && slot.endAt === endIso,
    );

    if (!matches) {
      throw new UnprocessableEntityException('Slot not available');
    }
  }

  private formatDateInTimeZone(date: Date, timeZone: string) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(date);
  }

  private getWeekday(dateStr: string, timeZone: string) {
    const date = new Date(`${dateStr}T12:00:00Z`);
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
    });
    const weekday = formatter.format(date);
    const map: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    return map[weekday];
  }

  private getDateRange(from: string, to: string) {
    const start = this.parseDate(from);
    const end = this.parseDate(to);

    const dates: string[] = [];
    let current = start;
    while (current <= end) {
      dates.push(this.formatDate(current));
      current = new Date(current.getTime() + 24 * 3600 * 1000);
    }
    return dates;
  }

  private buildSlotsForWindow(
    dateStr: string,
    window: AvailabilityWindowDto,
    config: DoctorSchedulingConfig,
    from: Date,
    to: Date,
    minStart: Date,
  ) {
    const slots: { startAt: string; endAt: string }[] = [];
    const slotMinutes = config.slotDurationMinutes;

    let cursor = this.toMinutes(window.startTime);
    const endMinutes = this.toMinutes(window.endTime);
    while (cursor + slotMinutes <= endMinutes) {
      const startTime = this.minutesToTime(cursor);
      const endTime = this.minutesToTime(cursor + slotMinutes);
      const startUtc = this.zonedTimeToUtc(dateStr, startTime, config.timezone);
      const endUtc = this.zonedTimeToUtc(dateStr, endTime, config.timezone);

      if (startUtc >= from && endUtc <= to && startUtc >= minStart) {
        slots.push({
          startAt: startUtc.toISOString(),
          endAt: endUtc.toISOString(),
        });
      }

      cursor += slotMinutes;
    }

    return slots;
  }

  private minutesToTime(minutes: number) {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  private zonedTimeToUtc(dateStr: string, timeStr: string, timeZone: string) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hour, minute] = timeStr.split(':').map(Number);
    const utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
    const offsetMinutes = this.getTimeZoneOffsetMinutes(utcDate, timeZone);
    return new Date(utcDate.getTime() - offsetMinutes * 60 * 1000);
  }

  private getTimeZoneOffsetMinutes(date: Date, timeZone: string) {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const map: Record<string, string> = {};
    for (const part of parts) {
      map[part.type] = part.value;
    }
    const asUTC = Date.UTC(
      Number(map.year),
      Number(map.month) - 1,
      Number(map.day),
      Number(map.hour),
      Number(map.minute),
      Number(map.second),
    );
    return (asUTC - date.getTime()) / 60000;
  }
}
