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

function dateParts(daysAhead: number) {
  const target = new Date(Date.now() + daysAhead * 24 * 3600 * 1000);
  const dateStr = target.toISOString().slice(0, 10);
  const dayOfWeek = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return { dateStr, dayOfWeek };
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

async function setUtcSchedulingConfig(
  prisma: PrismaService,
  doctorUserId: string,
) {
  await prisma.doctorSchedulingConfig.upsert({
    where: { userId: doctorUserId },
    create: {
      userId: doctorUserId,
      slotDurationMinutes: 20,
      leadTimeHours: 24,
      horizonDays: 60,
      timezone: 'UTC',
    },
    update: { timezone: 'UTC' },
  });
}

async function setAvailabilityRule(
  app: INestApplication,
  token: string,
  dayOfWeek: number,
  startTime = '09:00',
  endTime = '11:00',
) {
  await request(httpServer(app))
    .put('/api/v1/doctors/me/availability-rules')
    .set('Authorization', `Bearer ${token}`)
    .send({
      rules: [{ dayOfWeek, startTime, endTime, isActive: true }],
    })
    .expect(200);
}

async function createAppointment(
  app: INestApplication,
  prisma: PrismaService,
  doctorToken: string,
  patientToken: string,
) {
  const doctorMe = await request(httpServer(app))
    .get('/api/v1/auth/me')
    .set('Authorization', `Bearer ${doctorToken}`)
    .expect(200);
  const doctorUserId = doctorMe.body.id as string;

  await createDoctorProfile(app, doctorToken);
  await setUtcSchedulingConfig(prisma, doctorUserId);

  const { dateStr, dayOfWeek } = dateParts(2);
  await setAvailabilityRule(app, doctorToken, dayOfWeek);

  await createPatientIdentity(app, patientToken);

  const startAt = `${dateStr}T09:00:00.000Z`;

  const response = await request(httpServer(app))
    .post('/api/v1/appointments')
    .set('Authorization', `Bearer ${patientToken}`)
    .send({ doctorUserId, startAt })
    .expect(201);

  const appointmentId = response.body.appointment.id as string;

  await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: 'confirmed' },
  });

  return {
    appointmentId,
    doctorUserId,
    startAt,
  };
}

describe('Consultations (e2e)', () => {
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

  it('creates consultation and reuses it on repeat', async () => {
    const doctor = await registerAndLogin(app, 'doctor');
    const patient = await registerAndLogin(app, 'patient');

    const { appointmentId } = await createAppointment(
      app,
      prisma,
      doctor.accessToken,
      patient.accessToken,
    );

    const first = await request(httpServer(app))
      .post(`/api/v1/appointments/${appointmentId}/consultation`)
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .expect(201);

    const second = await request(httpServer(app))
      .post(`/api/v1/appointments/${appointmentId}/consultation`)
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .expect(200);

    expect(second.body.id).toBe(first.body.id);
  });

  it('patient can read but cannot modify consultation', async () => {
    const doctor = await registerAndLogin(app, 'doctor');
    const patient = await registerAndLogin(app, 'patient');

    const { appointmentId } = await createAppointment(
      app,
      prisma,
      doctor.accessToken,
      patient.accessToken,
    );

    const created = await request(httpServer(app))
      .post(`/api/v1/appointments/${appointmentId}/consultation`)
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .expect(201);

    const consultationId = created.body.id as string;

    await request(httpServer(app))
      .get(`/api/v1/consultations/${consultationId}`)
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .expect(200);

    await request(httpServer(app))
      .patch(`/api/v1/consultations/${consultationId}`)
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ summary: 'No permitido' })
      .expect(403);
  });

  it('doctor can close, then patch returns 409', async () => {
    const doctor = await registerAndLogin(app, 'doctor');
    const patient = await registerAndLogin(app, 'patient');

    const { appointmentId } = await createAppointment(
      app,
      prisma,
      doctor.accessToken,
      patient.accessToken,
    );

    const created = await request(httpServer(app))
      .post(`/api/v1/appointments/${appointmentId}/consultation`)
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .expect(201);

    const consultationId = created.body.id as string;

    await request(httpServer(app))
      .post(`/api/v1/consultations/${consultationId}/close`)
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .expect(200);

    await request(httpServer(app))
      .patch(`/api/v1/consultations/${consultationId}`)
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .send({ summary: 'Post close' })
      .expect(409);
  });

  it('does not allow consultation when appointment is cancelled', async () => {
    const doctor = await registerAndLogin(app, 'doctor');
    const patient = await registerAndLogin(app, 'patient');

    const { appointmentId } = await createAppointment(
      app,
      prisma,
      doctor.accessToken,
      patient.accessToken,
    );

    await request(httpServer(app))
      .post(`/api/v1/appointments/${appointmentId}/cancel`)
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ reason: 'No puedo asistir' })
      .expect(201);

    await request(httpServer(app))
      .post(`/api/v1/appointments/${appointmentId}/consultation`)
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .expect(409);
  });
});
