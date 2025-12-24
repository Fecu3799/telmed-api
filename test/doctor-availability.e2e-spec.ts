import {
  HttpStatus,
  UnprocessableEntityException,
  ValidationPipe,
} from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { mapValidationErrors } from '../src/common/utils/validation-errors';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { resetDb } from './helpers/reset-db';

function ensureEnv() {
  process.env.APP_ENV = process.env.APP_ENV ?? 'test';
  process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
  process.env.THROTTLE_ENABLED = process.env.THROTTLE_ENABLED ?? 'false';
  process.env.APP_PORT = process.env.APP_PORT ?? '0';
  process.env.JWT_ACCESS_SECRET =
    process.env.JWT_ACCESS_SECRET ?? 'test_access_secret_123456';
  process.env.JWT_REFRESH_SECRET =
    process.env.JWT_REFRESH_SECRET ?? 'test_refresh_secret_123456';
  process.env.JWT_ACCESS_TTL_SECONDS =
    process.env.JWT_ACCESS_TTL_SECONDS ?? '900';
  process.env.JWT_REFRESH_TTL_SECONDS =
    process.env.JWT_REFRESH_TTL_SECONDS ?? '2592000';
  process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL ?? '';

  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL or DATABASE_URL_TEST must be set for e2e tests',
    );
  }
}

function httpServer(app: INestApplication): Server {
  return app.getHttpServer() as unknown as Server;
}

async function registerAndLogin(
  app: INestApplication,
  role: 'patient' | 'doctor',
) {
  const email = `user_${randomUUID()}@test.com`;
  const password = 'Passw0rd!123';

  await request(httpServer(app))
    .post('/api/v1/auth/register')
    .send({ email, password, role })
    .expect(201);

  const loginResponse = await request(httpServer(app))
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(201);

  return loginResponse.body.accessToken as string;
}

function formatDateUTC(date: Date) {
  return date.toISOString().slice(0, 10);
}

describe('Doctor availability (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    ensureEnv();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ProblemDetailsFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        exceptionFactory: (errors) =>
          new UnprocessableEntityException({
            message: 'Validation failed',
            errors: mapValidationErrors(errors),
          }),
      }),
    );

    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDb(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('closed exception removes slots for the day', async () => {
    const token = await registerAndLogin(app, 'doctor');

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const doctorUserId = me.body.id as string;

    await prisma.doctorSchedulingConfig.upsert({
      where: { userId: doctorUserId },
      create: {
        userId: doctorUserId,
        slotDurationMinutes: 60,
        leadTimeHours: 24,
        horizonDays: 60,
        timezone: 'UTC',
      },
      update: { timezone: 'UTC' },
    });

    const targetDate = new Date(Date.now() + 48 * 3600 * 1000);
    const dateStr = formatDateUTC(targetDate);
    const dayOfWeek = new Date(`${dateStr}T00:00:00Z`).getUTCDay();

    await request(app.getHttpServer())
      .put('/api/v1/doctors/me/availability-rules')
      .set('Authorization', `Bearer ${token}`)
      .send({
        rules: [
          {
            dayOfWeek,
            startTime: '09:00',
            endTime: '11:00',
            isActive: true,
          },
        ],
      })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/doctors/me/availability-exceptions')
      .set('Authorization', `Bearer ${token}`)
      .send({ date: dateStr, type: 'closed' })
      .expect(201);

    const from = `${dateStr}T00:00:00.000Z`;
    const to = `${dateStr}T23:59:59.000Z`;

    const response = await request(app.getHttpServer())
      .get(`/api/v1/doctors/${doctorUserId}/availability`)
      .query({ from, to })
      .expect(200);

    expect(response.body.items).toEqual([]);
  });

  it('rejects requests outside lead time / horizon', async () => {
    const token = await registerAndLogin(app, 'doctor');

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const doctorUserId = me.body.id as string;

    const tooSoonFrom = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
    const tooSoonTo = new Date(Date.now() + 4 * 3600 * 1000).toISOString();

    await request(app.getHttpServer())
      .get(`/api/v1/doctors/${doctorUserId}/availability`)
      .query({ from: tooSoonFrom, to: tooSoonTo })
      .expect(422);

    const tooFarFrom = new Date(
      Date.now() + 61 * 24 * 3600 * 1000,
    ).toISOString();
    const tooFarTo = new Date(Date.now() + 62 * 24 * 3600 * 1000).toISOString();

    await request(app.getHttpServer())
      .get(`/api/v1/doctors/${doctorUserId}/availability`)
      .query({ from: tooFarFrom, to: tooFarTo })
      .expect(422);
  });
});
