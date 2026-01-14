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
import { ensureTestEnv } from './helpers/ensure-test-env';

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

describe('Appointments (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    ensureTestEnv();

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
    if (app) {
      await app.close();
    }
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

    await createPatientIdentity(app, patient.accessToken);

    const startAt = `${dateStr}T09:00:00.000Z`;

    const response = await request(httpServer(app))
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ doctorUserId, startAt })
      .expect(201);

    expect(response.body.appointment.doctorUserId).toBe(doctorUserId);
    expect(response.body.appointment.patientUserId).toBe(patientUserId);
    expect(response.body.appointment.status).toBe('pending_payment');
    expect(response.body.payment.checkoutUrl).toBeTruthy();
  });

  it('rejects appointment when patient identity is missing', async () => {
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
    const startAt = `${dateStr}T09:00:00.000Z`;

    await request(httpServer(app))
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ doctorUserId, startAt })
      .expect(409);
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

    await createPatientIdentity(app, patient.accessToken);

    const adminToken = await createAdmin(app, prisma);
    const startAt = `${dateStr}T09:00:00.000Z`;

    const response = await request(httpServer(app))
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ doctorUserId, patientUserId, startAt })
      .expect(201);

    expect(response.body.appointment.patientUserId).toBe(patientUserId);
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
    await createPatientIdentity(app, patient.accessToken);

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
    await createPatientIdentity(app, patient.accessToken);

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
    await createPatientIdentity(app, patient.accessToken);

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
    await createPatientIdentity(app, patient.accessToken);

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

    await createPatientIdentity(app, patient.accessToken);

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

    await createPatientIdentity(app, patient.accessToken);

    const createResponse = await request(httpServer(app))
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ doctorUserId, startAt: `${dateStr}T09:00:00.000Z` })
      .expect(201);

    const appointmentId = createResponse.body.appointment.id as string;

    const intruder = await registerAndLogin(app, 'patient');
    await createPatientIdentity(app, intruder.accessToken);

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

  it('patient can request payment checkout for unpaid appointment', async () => {
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
    await createPatientIdentity(app, patient.accessToken);

    const createResponse = await request(httpServer(app))
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ doctorUserId, startAt: `${dateStr}T09:00:00.000Z` })
      .expect(201);

    const appointmentId = createResponse.body.appointment.id as string;
    expect(createResponse.body.appointment.status).toBe('pending_payment');

    const payResponse = await request(httpServer(app))
      .post(`/api/v1/appointments/${appointmentId}/pay`)
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .expect(200);

    expect(payResponse.body.checkoutUrl).toBeDefined();
    expect(payResponse.body.id).toBeDefined();
    expect(payResponse.body.status).toBe('pending');
    expect(payResponse.body.expiresAt).toBeDefined();
  });

  it('idempotency key returns same payment', async () => {
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
    await createPatientIdentity(app, patient.accessToken);

    const createResponse = await request(httpServer(app))
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ doctorUserId, startAt: `${dateStr}T09:00:00.000Z` })
      .expect(201);

    const appointmentId = createResponse.body.appointment.id as string;
    const idempotencyKey = randomUUID();

    const payResponse1 = await request(httpServer(app))
      .post(`/api/v1/appointments/${appointmentId}/pay`)
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .expect(200);

    const payResponse2 = await request(httpServer(app))
      .post(`/api/v1/appointments/${appointmentId}/pay`)
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .expect(200);

    expect(payResponse1.body.id).toBe(payResponse2.body.id);
    expect(payResponse1.body.checkoutUrl).toBe(payResponse2.body.checkoutUrl);
  });

  it('other patient cannot request payment for appointment', async () => {
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
    await createPatientIdentity(app, patient.accessToken);

    const createResponse = await request(httpServer(app))
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ doctorUserId, startAt: `${dateStr}T09:00:00.000Z` })
      .expect(201);

    const appointmentId = createResponse.body.appointment.id as string;

    const intruder = await registerAndLogin(app, 'patient');
    await createPatientIdentity(app, intruder.accessToken);

    await request(httpServer(app))
      .post(`/api/v1/appointments/${appointmentId}/pay`)
      .set('Authorization', `Bearer ${intruder.accessToken}`)
      .expect(403);
  });

  it('returns 404 for non-existent appointment', async () => {
    const patient = await registerAndLogin(app, 'patient');
    await createPatientIdentity(app, patient.accessToken);

    const fakeId = randomUUID();

    await request(httpServer(app))
      .post(`/api/v1/appointments/${fakeId}/pay`)
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .expect(404);
  });

  it('returns 409 for already paid appointment', async () => {
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
    await createPatientIdentity(app, patient.accessToken);

    const createResponse = await request(httpServer(app))
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ doctorUserId, startAt: `${dateStr}T09:00:00.000Z` })
      .expect(201);

    const appointmentId = createResponse.body.appointment.id as string;

    // Mark payment as paid directly in DB (simulating webhook)
    const payment = await prisma.payment.findFirst({
      where: { appointmentId },
    });
    if (payment) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'paid' },
      });
      await prisma.appointment.update({
        where: { id: appointmentId },
        data: { status: 'confirmed' },
      });
    }

    await request(httpServer(app))
      .post(`/api/v1/appointments/${appointmentId}/pay`)
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .expect(409);
  });

  it('doctor cannot request payment for appointment', async () => {
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
    await createPatientIdentity(app, patient.accessToken);

    const createResponse = await request(httpServer(app))
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ doctorUserId, startAt: `${dateStr}T09:00:00.000Z` })
      .expect(201);

    const appointmentId = createResponse.body.appointment.id as string;

    await request(httpServer(app))
      .post(`/api/v1/appointments/${appointmentId}/pay`)
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .expect(403);
  });
});
