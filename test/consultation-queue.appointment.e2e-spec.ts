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
import { CLOCK } from '../src/common/clock/clock';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { FakeClock } from './utils/fake-clock';

const BASE_TIME = new Date('2025-01-05T10:00:00.000Z');

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
  process.env.MERCADOPAGO_ACCESS_TOKEN =
    process.env.MERCADOPAGO_ACCESS_TOKEN ?? 'test_mp_access_token';
  process.env.MERCADOPAGO_WEBHOOK_SECRET =
    process.env.MERCADOPAGO_WEBHOOK_SECRET ?? 'test_mp_webhook_secret';
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

  return {
    accessToken: loginResponse.body.accessToken as string,
  };
}

async function getUserId(app: INestApplication, token: string) {
  const me = await request(httpServer(app))
    .get('/api/v1/auth/me')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  return me.body.id as string;
}

async function createDoctorProfile(app: INestApplication, token: string) {
  await request(httpServer(app))
    .put('/api/v1/doctors/me/profile')
    .set('Authorization', `Bearer ${token}`)
    .send({
      firstName: 'Ana',
      lastName: 'Test',
      bio: 'Cardiologa',
      priceCents: 120000,
      currency: 'ARS',
    })
    .expect(200);
}

async function createPatientIdentity(app: INestApplication, token: string) {
  await request(httpServer(app))
    .patch('/api/v1/patients/me/identity')
    .set('Authorization', `Bearer ${token}`)
    .send({
      legalFirstName: 'Juan',
      legalLastName: 'Paciente',
      documentType: 'DNI',
      documentNumber: `30${Math.floor(Math.random() * 10000000)}`,
      documentCountry: 'AR',
      birthDate: '1990-05-10',
      phone: '+5491100000000',
    })
    .expect(200);
}

async function setAvailabilityRules(app: INestApplication, token: string) {
  await request(httpServer(app))
    .put('/api/v1/doctors/me/availability-rules')
    .set('Authorization', `Bearer ${token}`)
    .send({
      rules: [
        { dayOfWeek: 0, startTime: '00:00', endTime: '23:59', isActive: true },
        { dayOfWeek: 1, startTime: '00:00', endTime: '23:59', isActive: true },
        { dayOfWeek: 2, startTime: '00:00', endTime: '23:59', isActive: true },
        { dayOfWeek: 3, startTime: '00:00', endTime: '23:59', isActive: true },
        { dayOfWeek: 4, startTime: '00:00', endTime: '23:59', isActive: true },
        { dayOfWeek: 5, startTime: '00:00', endTime: '23:59', isActive: true },
        { dayOfWeek: 6, startTime: '00:00', endTime: '23:59', isActive: true },
      ],
    })
    .expect(200);
}

describe('Consultation queue with appointment (time travel)', () => {
  let app: INestApplication<App>;
  let fakeClock: FakeClock;
  let prisma: PrismaService;

  beforeAll(async () => {
    ensureEnv();

    fakeClock = new FakeClock(new Date(BASE_TIME));

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CLOCK)
      .useValue(fakeClock)
      .compile();

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

  afterAll(async () => {
    await app.close();
  });

  it('creates appointment with lead time and enqueues within window', async () => {
    fakeClock.setNow(new Date(BASE_TIME));

    const doctor = await registerAndLogin(app, 'doctor');
    const doctorUserId = await getUserId(app, doctor.accessToken);
    await createDoctorProfile(app, doctor.accessToken);
    await setAvailabilityRules(app, doctor.accessToken);

    const patient = await registerAndLogin(app, 'patient');
    await createPatientIdentity(app, patient.accessToken);

    const from = new Date(fakeClock.now().getTime() + 25 * 60 * 60 * 1000);
    const to = new Date(fakeClock.now().getTime() + 27 * 60 * 60 * 1000);

    const availability = await request(httpServer(app))
      .get(`/api/v1/doctors/${doctorUserId}/availability`)
      .query({ from: from.toISOString(), to: to.toISOString() })
      .expect(200);

    const startAt = availability.body.items[0]?.startAt as string;
    expect(startAt).toBeTruthy();

    const appointment = await request(httpServer(app))
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ doctorUserId, startAt })
      .expect(201);

    const appointmentId = appointment.body.appointment.id as string;

    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: 'confirmed' },
    });

    const windowTime = new Date(Date.parse(startAt) - 5 * 60 * 1000);
    fakeClock.setNow(windowTime);

    const queue = await request(httpServer(app))
      .post('/api/v1/consultations/queue')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ appointmentId, doctorUserId })
      .expect(201);

    expect(queue.body.appointmentId).toBe(appointmentId);

    const list = await request(httpServer(app))
      .get('/api/v1/consultations/queue')
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .expect(200);

    expect(
      list.body.some(
        (item: { appointmentId: string }) =>
          item.appointmentId === appointmentId,
      ),
    ).toBe(true);

    await request(httpServer(app))
      .post('/api/v1/consultations/queue')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ appointmentId, doctorUserId })
      .expect(409);
  });
});
