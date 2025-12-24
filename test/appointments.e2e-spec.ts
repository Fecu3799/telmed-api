import {
  HttpStatus,
  UnprocessableEntityException,
  ValidationPipe,
} from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
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

  return {
    accessToken: loginResponse.body.accessToken as string,
    email,
    password,
  };
}

async function createAdmin(app: INestApplication, prisma: PrismaService) {
  const email = `admin_${randomUUID()}@test.com`;
  const password = 'Passw0rd!123';
  const passwordHash = await argon2.hash(password);

  await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: 'admin',
    },
  });

  const loginResponse = await request(httpServer(app))
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(201);

  return loginResponse.body.accessToken as string;
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

async function createPatientProfile(app: INestApplication, token: string) {
  await request(httpServer(app))
    .put('/api/v1/patients/me/profile')
    .set('Authorization', `Bearer ${token}`)
    .send({
      firstName: 'Juan',
      lastName: 'Paciente',
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
      slotDurationMinutes: 60,
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

describe('Appointments (e2e)', () => {
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

  it('patient creates a valid appointment', async () => {
    const doctor = await registerAndLogin(app, 'doctor');
    const doctorMe = await request(httpServer(app))
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .expect(200);
    const doctorUserId = doctorMe.body.id as string;

    await createDoctorProfile(app, doctor.accessToken);
    await setUtcSchedulingConfig(prisma, doctorUserId);

    const { dateStr, dayOfWeek } = dateParts(2);
    await setAvailabilityRule(app, doctor.accessToken, dayOfWeek);

    const patient = await registerAndLogin(app, 'patient');
    const patientMe = await request(httpServer(app))
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .expect(200);
    const patientUserId = patientMe.body.id as string;

    await createPatientProfile(app, patient.accessToken);

    const startAt = `${dateStr}T09:00:00.000Z`;

    const response = await request(httpServer(app))
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ doctorUserId, startAt })
      .expect(201);

    expect(response.body.doctorUserId).toBe(doctorUserId);
    expect(response.body.patientUserId).toBe(patientUserId);
    expect(response.body.status).toBe('scheduled');
  });

  it('admin creates an appointment for a patient', async () => {
    const doctor = await registerAndLogin(app, 'doctor');
    const doctorMe = await request(httpServer(app))
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .expect(200);
    const doctorUserId = doctorMe.body.id as string;

    await createDoctorProfile(app, doctor.accessToken);
    await setUtcSchedulingConfig(prisma, doctorUserId);

    const { dateStr, dayOfWeek } = dateParts(2);
    await setAvailabilityRule(app, doctor.accessToken, dayOfWeek);

    const patient = await registerAndLogin(app, 'patient');
    const patientMe = await request(httpServer(app))
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .expect(200);
    const patientUserId = patientMe.body.id as string;

    await createPatientProfile(app, patient.accessToken);

    const adminToken = await createAdmin(app, prisma);
    const startAt = `${dateStr}T09:00:00.000Z`;

    const response = await request(httpServer(app))
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ doctorUserId, patientUserId, startAt })
      .expect(201);

    expect(response.body.patientUserId).toBe(patientUserId);
  });

  it('rejects overlapping appointments for the same doctor', async () => {
    const doctor = await registerAndLogin(app, 'doctor');
    const doctorMe = await request(httpServer(app))
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .expect(200);
    const doctorUserId = doctorMe.body.id as string;

    await createDoctorProfile(app, doctor.accessToken);
    await setUtcSchedulingConfig(prisma, doctorUserId);

    const { dateStr, dayOfWeek } = dateParts(2);
    await setAvailabilityRule(app, doctor.accessToken, dayOfWeek);

    const patient = await registerAndLogin(app, 'patient');
    await createPatientProfile(app, patient.accessToken);

    const startAt = `${dateStr}T09:00:00.000Z`;

    await request(httpServer(app))
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ doctorUserId, startAt })
      .expect(201);

    await request(httpServer(app))
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ doctorUserId, startAt })
      .expect(409);
  });

  it('rejects appointments outside lead time or horizon', async () => {
    const doctor = await registerAndLogin(app, 'doctor');
    const doctorMe = await request(httpServer(app))
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .expect(200);
    const doctorUserId = doctorMe.body.id as string;

    await createDoctorProfile(app, doctor.accessToken);
    await setUtcSchedulingConfig(prisma, doctorUserId);

    const soonDate = new Date(Date.now() + 2 * 3600 * 1000);
    const soonDateStr = soonDate.toISOString().slice(0, 10);
    const soonDay = new Date(`${soonDateStr}T00:00:00Z`).getUTCDay();
    await setAvailabilityRule(app, doctor.accessToken, soonDay);

    const patient = await registerAndLogin(app, 'patient');
    await createPatientProfile(app, patient.accessToken);

    const tooSoonStart = new Date(Date.now() + 2 * 3600 * 1000).toISOString();

    await request(httpServer(app))
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ doctorUserId, startAt: tooSoonStart })
      .expect(422);

    const farDate = new Date(Date.now() + 61 * 24 * 3600 * 1000).toISOString();
    await request(httpServer(app))
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ doctorUserId, startAt: farDate })
      .expect(422);
  });

  it('rejects appointments on closed dates', async () => {
    const doctor = await registerAndLogin(app, 'doctor');
    const doctorMe = await request(httpServer(app))
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .expect(200);
    const doctorUserId = doctorMe.body.id as string;

    await createDoctorProfile(app, doctor.accessToken);
    await setUtcSchedulingConfig(prisma, doctorUserId);

    const { dateStr, dayOfWeek } = dateParts(2);
    await setAvailabilityRule(app, doctor.accessToken, dayOfWeek);

    await request(httpServer(app))
      .post('/api/v1/doctors/me/availability-exceptions')
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .send({ date: dateStr, type: 'closed' })
      .expect(201);

    const patient = await registerAndLogin(app, 'patient');
    await createPatientProfile(app, patient.accessToken);

    const startAt = `${dateStr}T09:00:00.000Z`;

    await request(httpServer(app))
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ doctorUserId, startAt })
      .expect(422);
  });

  it('lists appointments for patient and doctor', async () => {
    const doctor = await registerAndLogin(app, 'doctor');
    const doctorMe = await request(httpServer(app))
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .expect(200);
    const doctorUserId = doctorMe.body.id as string;

    await createDoctorProfile(app, doctor.accessToken);
    await setUtcSchedulingConfig(prisma, doctorUserId);

    const { dateStr, dayOfWeek } = dateParts(2);
    await setAvailabilityRule(app, doctor.accessToken, dayOfWeek);

    const patient = await registerAndLogin(app, 'patient');
    await createPatientProfile(app, patient.accessToken);

    const startAt = `${dateStr}T09:00:00.000Z`;

    await request(httpServer(app))
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ doctorUserId, startAt })
      .expect(201);

    const from = `${dateStr}T00:00:00.000Z`;
    const to = `${dateStr}T23:59:59.000Z`;

    const patientList = await request(httpServer(app))
      .get('/api/v1/patients/me/appointments')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .query({ from, to, page: 1, limit: 10 })
      .expect(200);

    expect(patientList.body.items).toHaveLength(1);

    const doctorList = await request(httpServer(app))
      .get('/api/v1/doctors/me/appointments')
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .query({ from, to, page: 1, limit: 10 })
      .expect(200);

    expect(doctorList.body.items).toHaveLength(1);
  });

  it('admin lists appointments with filters', async () => {
    const doctor = await registerAndLogin(app, 'doctor');
    const doctorMe = await request(httpServer(app))
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .expect(200);
    const doctorUserId = doctorMe.body.id as string;

    await createDoctorProfile(app, doctor.accessToken);
    await setUtcSchedulingConfig(prisma, doctorUserId);

    const { dateStr, dayOfWeek } = dateParts(2);
    await setAvailabilityRule(app, doctor.accessToken, dayOfWeek);

    const patient = await registerAndLogin(app, 'patient');
    const patientMe = await request(httpServer(app))
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .expect(200);
    const patientUserId = patientMe.body.id as string;

    await createPatientProfile(app, patient.accessToken);

    await request(httpServer(app))
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ doctorUserId, startAt: `${dateStr}T09:00:00.000Z` })
      .expect(201);

    const adminToken = await createAdmin(app, prisma);
    const from = `${dateStr}T00:00:00.000Z`;
    const to = `${dateStr}T23:59:59.000Z`;

    const response = await request(httpServer(app))
      .get('/api/v1/admin/appointments')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ from, to, doctorUserId, patientUserId, page: 1, limit: 10 })
      .expect(200);

    expect(response.body.items).toHaveLength(1);
  });

  it('cancels appointments with proper ownership rules', async () => {
    const doctor = await registerAndLogin(app, 'doctor');
    const doctorMe = await request(httpServer(app))
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .expect(200);
    const doctorUserId = doctorMe.body.id as string;

    await createDoctorProfile(app, doctor.accessToken);
    await setUtcSchedulingConfig(prisma, doctorUserId);

    const { dateStr, dayOfWeek } = dateParts(2);
    await setAvailabilityRule(app, doctor.accessToken, dayOfWeek);

    const patient = await registerAndLogin(app, 'patient');
    const patientMe = await request(httpServer(app))
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .expect(200);
    const patientUserId = patientMe.body.id as string;

    await createPatientProfile(app, patient.accessToken);

    const createResponse = await request(httpServer(app))
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ doctorUserId, startAt: `${dateStr}T09:00:00.000Z` })
      .expect(201);

    const appointmentId = createResponse.body.id as string;

    const intruder = await registerAndLogin(app, 'patient');
    await createPatientProfile(app, intruder.accessToken);

    await request(httpServer(app))
      .post(`/api/v1/appointments/${appointmentId}/cancel`)
      .set('Authorization', `Bearer ${intruder.accessToken}`)
      .send({ reason: 'No corresponde' })
      .expect(403);

    const cancelResponse = await request(httpServer(app))
      .post(`/api/v1/appointments/${appointmentId}/cancel`)
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ reason: 'No puedo asistir' })
      .expect(201);

    expect(cancelResponse.body.status).toBe('cancelled');
    expect(cancelResponse.body.patientUserId).toBe(patientUserId);
  });
});
