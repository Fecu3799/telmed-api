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
import { CLOCK } from '../src/common/clock/clock';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { mapValidationErrors } from '../src/common/utils/validation-errors';
import {
  MERCADOPAGO_CLIENT,
  signWebhookPayload,
} from '../src/modules/payments/mercadopago.client';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { resetDb } from './helpers/reset-db';
import { FakeClock } from './utils/fake-clock';
import { FakeMercadoPagoClient } from './utils/fake-mercadopago-client';

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

describe('Payments (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fakeClock: FakeClock;
  let fakeMp: FakeMercadoPagoClient;

  beforeAll(async () => {
    ensureEnv();

    fakeClock = new FakeClock(new Date(BASE_TIME));
    fakeMp = new FakeMercadoPagoClient();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CLOCK)
      .useValue(fakeClock)
      .overrideProvider(MERCADOPAGO_CLIENT)
      .useValue(fakeMp)
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

  beforeEach(async () => {
    await resetDb(prisma);
    fakeClock.setNow(new Date(BASE_TIME));
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates appointment payment and confirms on webhook', async () => {
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

    const createAppointment = await request(httpServer(app))
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .set('Idempotency-Key', 'idemp-appointment-1')
      .send({ doctorUserId, startAt })
      .expect(201);

    const appointmentId = createAppointment.body.appointment.id as string;
    const paymentId = createAppointment.body.payment.id as string;

    fakeMp.setPayment('mp_1', {
      id: 'mp_1',
      status: 'approved',
      transaction_amount: 1200,
      currency_id: 'ARS',
      metadata: { paymentId },
    });

    const requestId = 'req_webhook_1';
    const body = { data: { id: 'mp_1' } };
    const signature = signWebhookPayload(
      process.env.MERCADOPAGO_WEBHOOK_SECRET as string,
      requestId,
      body,
    );

    await request(httpServer(app))
      .post('/api/v1/payments/webhooks/mercadopago')
      .set('x-request-id', requestId)
      .set('x-signature', signature)
      .send(body)
      .expect(200);

    const list = await request(httpServer(app))
      .get('/api/v1/patients/me/appointments')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .query({
        from: from.toISOString(),
        to: to.toISOString(),
        page: 1,
        limit: 10,
      })
      .expect(200);

    const confirmed = list.body.items.find(
      (item: { id: string }) => item.id === appointmentId,
    );
    expect(confirmed.status).toBe('confirmed');
  });

  it('expires pending payment on read and cancels appointment', async () => {
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

    await request(httpServer(app))
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ doctorUserId, startAt })
      .expect(201);

    fakeClock.setNow(new Date(BASE_TIME.getTime() + 11 * 60 * 1000));

    const list = await request(httpServer(app))
      .get('/api/v1/patients/me/appointments')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .query({
        from: from.toISOString(),
        to: to.toISOString(),
        page: 1,
        limit: 10,
      })
      .expect(200);

    expect(list.body.items[0].status).toBe('cancelled');
  });

  it('enables emergency payment and allows accept after paid', async () => {
    const doctor = await registerAndLogin(app, 'doctor');
    const doctorUserId = await getUserId(app, doctor.accessToken);
    await createDoctorProfile(app, doctor.accessToken);

    const patient = await registerAndLogin(app, 'patient');
    await createPatientIdentity(app, patient.accessToken);

    const queue = await request(httpServer(app))
      .post('/api/v1/consultations/queue')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ doctorUserId, reason: 'Dolor agudo' })
      .expect(201);

    const queueId = queue.body.id as string;

    const enable = await request(httpServer(app))
      .post(`/api/v1/consultations/queue/${queueId}/enable-payment`)
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .set('Idempotency-Key', 'idemp-queue-1')
      .expect(201);

    const paymentId = enable.body.id as string;

    fakeMp.setPayment('mp_2', {
      id: 'mp_2',
      status: 'approved',
      transaction_amount: 1200,
      currency_id: 'ARS',
      metadata: { paymentId },
    });

    const requestId = 'req_webhook_2';
    const body = { data: { id: 'mp_2' } };
    const signature = signWebhookPayload(
      process.env.MERCADOPAGO_WEBHOOK_SECRET as string,
      requestId,
      body,
    );

    await request(httpServer(app))
      .post('/api/v1/payments/webhooks/mercadopago')
      .set('x-request-id', requestId)
      .set('x-signature', signature)
      .send(body)
      .expect(200);

    await request(httpServer(app))
      .post(`/api/v1/consultations/queue/${queueId}/accept`)
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .expect(201);

    await request(httpServer(app))
      .post(`/api/v1/consultations/queue/${queueId}/close`)
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .expect(201);

    const queueNoPayment = await request(httpServer(app))
      .post('/api/v1/consultations/queue')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ doctorUserId, reason: 'Dolor agudo' })
      .expect(201);

    await request(httpServer(app))
      .post(`/api/v1/consultations/queue/${queueNoPayment.body.id}/accept`)
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .expect(409);
  });
});
