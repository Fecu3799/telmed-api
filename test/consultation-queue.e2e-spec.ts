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
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { resetDb } from './helpers/reset-db';
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

async function getUserId(app: INestApplication, token: string) {
  const me = await request(httpServer(app))
    .get('/api/v1/auth/me')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  return me.body.id as string;
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

async function getAvailabilitySlots(
  app: INestApplication,
  doctorUserId: string,
  from: Date,
  to: Date,
) {
  const availability = await request(httpServer(app))
    .get(`/api/v1/doctors/${doctorUserId}/availability`)
    .query({ from: from.toISOString(), to: to.toISOString() })
    .expect(200);

  return availability.body.items as Array<{ startAt: string; endAt: string }>;
}

async function createAppointment(
  app: INestApplication,
  prisma: PrismaService,
  token: string,
  doctorUserId: string,
  startAt: string,
  reason?: string,
) {
  const response = await request(httpServer(app))
    .post('/api/v1/appointments')
    .set('Authorization', `Bearer ${token}`)
    .send({ doctorUserId, startAt, reason })
    .expect(201);

  const appointment = response.body.appointment as { id: string };

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: 'confirmed' },
  });

  return appointment;
}

describe('Consultation queue (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fakeClock: FakeClock;

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

  beforeEach(async () => {
    await resetDb(prisma);
    fakeClock.setNow(new Date(BASE_TIME));
  });

  afterAll(async () => {
    await app.close();
  });

  it('patient creates queue, doctor accepts', async () => {
    const doctor = await registerAndLogin(app, 'doctor');
    const doctorUserId = await getUserId(app, doctor.accessToken);
    await createDoctorProfile(app, doctor.accessToken);
    await setAvailabilityRules(app, doctor.accessToken);

    const patient = await registerAndLogin(app, 'patient');
    await createPatientProfile(app, patient.accessToken);

    const from = new Date(fakeClock.now().getTime() + 25 * 60 * 60 * 1000);
    const to = new Date(fakeClock.now().getTime() + 27 * 60 * 60 * 1000);
    const slots = await getAvailabilitySlots(app, doctorUserId, from, to);
    expect(slots.length).toBeGreaterThan(0);

    const appointmentReason = 'Control anual';
    const appointment = await createAppointment(
      app,
      prisma,
      patient.accessToken,
      doctorUserId,
      slots[0].startAt,
      appointmentReason,
    );

    fakeClock.setNow(new Date(Date.parse(slots[0].startAt) - 5 * 60 * 1000));

    const createResponse = await request(httpServer(app))
      .post('/api/v1/consultations/queue')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ doctorUserId, appointmentId: appointment.id })
      .expect(201);

    const queueId = createResponse.body.id as string;
    expect(createResponse.body.entryType).toBe('appointment');
    expect(createResponse.body.paymentStatus).toBe('not_required');
    expect(createResponse.body.reason).toBe(appointmentReason);

    await request(httpServer(app))
      .post(`/api/v1/consultations/queue/${queueId}/enable-payment`)
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .expect(409);

    const acceptResponse = await request(httpServer(app))
      .post(`/api/v1/consultations/queue/${queueId}/accept`)
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .expect(201);

    expect(acceptResponse.body.status).toBe('accepted');
  });

  it('rejects duplicate active queue without appointment', async () => {
    const doctor = await registerAndLogin(app, 'doctor');
    const doctorUserId = await getUserId(app, doctor.accessToken);
    await createDoctorProfile(app, doctor.accessToken);

    const patient = await registerAndLogin(app, 'patient');
    await createPatientProfile(app, patient.accessToken);

    await request(httpServer(app))
      .post('/api/v1/consultations/queue')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ doctorUserId, reason: 'Dolor agudo' })
      .expect(201);

    await request(httpServer(app))
      .post('/api/v1/consultations/queue')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ doctorUserId, reason: 'Dolor agudo' })
      .expect(409);
  });

  it('enforces ownership on GET', async () => {
    const doctor = await registerAndLogin(app, 'doctor');
    const doctorUserId = await getUserId(app, doctor.accessToken);
    await createDoctorProfile(app, doctor.accessToken);
    await setAvailabilityRules(app, doctor.accessToken);

    const patient = await registerAndLogin(app, 'patient');
    await createPatientProfile(app, patient.accessToken);

    const from = new Date(fakeClock.now().getTime() + 25 * 60 * 60 * 1000);
    const to = new Date(fakeClock.now().getTime() + 27 * 60 * 60 * 1000);
    const slots = await getAvailabilitySlots(app, doctorUserId, from, to);
    expect(slots.length).toBeGreaterThan(0);

    const appointment = await createAppointment(
      app,
      prisma,
      patient.accessToken,
      doctorUserId,
      slots[0].startAt,
    );

    fakeClock.setNow(new Date(Date.parse(slots[0].startAt) - 5 * 60 * 1000));

    const createResponse = await request(httpServer(app))
      .post('/api/v1/consultations/queue')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ doctorUserId, appointmentId: appointment.id })
      .expect(201);

    const queueId = createResponse.body.id as string;

    const otherPatient = await registerAndLogin(app, 'patient');
    await createPatientProfile(app, otherPatient.accessToken);

    await request(httpServer(app))
      .get(`/api/v1/consultations/queue/${queueId}`)
      .set('Authorization', `Bearer ${otherPatient.accessToken}`)
      .expect(403);
  });

  it('returns 404 when patient profile is missing', async () => {
    const doctor = await registerAndLogin(app, 'doctor');
    const doctorUserId = await getUserId(app, doctor.accessToken);
    await createDoctorProfile(app, doctor.accessToken);

    const patient = await registerAndLogin(app, 'patient');

    await request(httpServer(app))
      .post('/api/v1/consultations/queue')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ doctorUserId, reason: 'Dolor agudo' })
      .expect(404);
  });

  it('returns 404 when doctor profile is missing', async () => {
    const doctor = await registerAndLogin(app, 'doctor');
    const doctorUserId = await getUserId(app, doctor.accessToken);

    const patient = await registerAndLogin(app, 'patient');
    await createPatientProfile(app, patient.accessToken);

    await request(httpServer(app))
      .post('/api/v1/consultations/queue')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ doctorUserId, reason: 'Dolor agudo' })
      .expect(404);
  });

  it('enforces waiting-room window for appointment queues', async () => {
    const doctor = await registerAndLogin(app, 'doctor');
    await createDoctorProfile(app, doctor.accessToken);
    await setAvailabilityRules(app, doctor.accessToken);
    const doctorUserId = await getUserId(app, doctor.accessToken);

    const patient = await registerAndLogin(app, 'patient');
    await createPatientProfile(app, patient.accessToken);

    const from = new Date(fakeClock.now().getTime() + 25 * 60 * 60 * 1000);
    const to = new Date(fakeClock.now().getTime() + 27 * 60 * 60 * 1000);
    const slots = await getAvailabilitySlots(app, doctorUserId, from, to);
    expect(slots.length).toBeGreaterThan(2);

    const appointmentOk = await createAppointment(
      app,
      prisma,
      patient.accessToken,
      doctorUserId,
      slots[0].startAt,
    );

    const appointmentEarly = await createAppointment(
      app,
      prisma,
      patient.accessToken,
      doctorUserId,
      slots[1].startAt,
    );

    const appointmentLate = await createAppointment(
      app,
      prisma,
      patient.accessToken,
      doctorUserId,
      slots[2].startAt,
    );

    fakeClock.setNow(new Date(Date.parse(slots[1].startAt) - 20 * 60 * 1000));

    await request(httpServer(app))
      .post('/api/v1/consultations/queue')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ doctorUserId, appointmentId: appointmentEarly.id })
      .expect(422);

    fakeClock.setNow(new Date(Date.parse(slots[0].startAt) - 10 * 60 * 1000));

    await request(httpServer(app))
      .post('/api/v1/consultations/queue')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ doctorUserId, appointmentId: appointmentOk.id })
      .expect(201);

    fakeClock.setNow(new Date(Date.parse(slots[2].startAt) + 20 * 60 * 1000));

    await request(httpServer(app))
      .post('/api/v1/consultations/queue')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ doctorUserId, appointmentId: appointmentLate.id })
      .expect(422);
  });

  it('expires queued items on read and allows accept/reject', async () => {
    const doctor = await registerAndLogin(app, 'doctor');
    const doctorUserId = await getUserId(app, doctor.accessToken);
    await createDoctorProfile(app, doctor.accessToken);
    await setAvailabilityRules(app, doctor.accessToken);

    const patient = await registerAndLogin(app, 'patient');
    await createPatientProfile(app, patient.accessToken);

    const from = new Date(fakeClock.now().getTime() + 25 * 60 * 60 * 1000);
    const to = new Date(fakeClock.now().getTime() + 27 * 60 * 60 * 1000);
    const slots = await getAvailabilitySlots(app, doctorUserId, from, to);
    expect(slots.length).toBeGreaterThan(2);

    const appointment = await createAppointment(
      app,
      prisma,
      patient.accessToken,
      doctorUserId,
      slots[0].startAt,
    );

    fakeClock.setNow(new Date(Date.parse(slots[0].startAt) - 5 * 60 * 1000));

    const createResponse = await request(httpServer(app))
      .post('/api/v1/consultations/queue')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ doctorUserId, appointmentId: appointment.id })
      .expect(201);

    const queueId = createResponse.body.id as string;

    fakeClock.setNow(new Date(Date.parse(slots[0].startAt) + 20 * 60 * 1000));

    const listResponse = await request(httpServer(app))
      .get('/api/v1/consultations/queue')
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .expect(200);

    const expiredItem = listResponse.body.find(
      (item: { id: string }) => item.id === queueId,
    );
    expect(expiredItem.status).toBe('expired');

    const getResponse = await request(httpServer(app))
      .get(`/api/v1/consultations/queue/${queueId}`)
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .expect(200);

    expect(getResponse.body.status).toBe('expired');

    const acceptResponse = await request(httpServer(app))
      .post(`/api/v1/consultations/queue/${queueId}/accept`)
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .expect(201);

    expect(acceptResponse.body.status).toBe('accepted');

    const otherPatient = await registerAndLogin(app, 'patient');
    await createPatientProfile(app, otherPatient.accessToken);

    fakeClock.setNow(new Date(BASE_TIME));
    const secondAppointment = await createAppointment(
      app,
      prisma,
      otherPatient.accessToken,
      doctorUserId,
      slots[1].startAt,
    );

    fakeClock.setNow(new Date(Date.parse(slots[1].startAt) - 5 * 60 * 1000));

    const secondQueue = await request(httpServer(app))
      .post('/api/v1/consultations/queue')
      .set('Authorization', `Bearer ${otherPatient.accessToken}`)
      .send({ doctorUserId, appointmentId: secondAppointment.id })
      .expect(201);

    const secondQueueId = secondQueue.body.id as string;

    fakeClock.setNow(new Date(Date.parse(slots[1].startAt) + 20 * 60 * 1000));

    await request(httpServer(app))
      .get(`/api/v1/consultations/queue/${secondQueueId}`)
      .set('Authorization', `Bearer ${otherPatient.accessToken}`)
      .expect(200);

    const rejectResponse = await request(httpServer(app))
      .post(`/api/v1/consultations/queue/${secondQueueId}/reject`)
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .send({ reason: 'No disponible' })
      .expect(201);

    expect(rejectResponse.body.status).toBe('rejected');
  });

  it('orders queue with accepted, ontime, early, walk-ins, expired', async () => {
    const doctor = await registerAndLogin(app, 'doctor');
    await createDoctorProfile(app, doctor.accessToken);
    await setAvailabilityRules(app, doctor.accessToken);
    const doctorUserId = await getUserId(app, doctor.accessToken);

    const patientA = await registerAndLogin(app, 'patient');
    await createPatientProfile(app, patientA.accessToken);

    const patientB = await registerAndLogin(app, 'patient');
    await createPatientProfile(app, patientB.accessToken);

    const patientC = await registerAndLogin(app, 'patient');
    await createPatientProfile(app, patientC.accessToken);

    const patientD = await registerAndLogin(app, 'patient');
    await createPatientProfile(app, patientD.accessToken);

    const patientE = await registerAndLogin(app, 'patient');
    await createPatientProfile(app, patientE.accessToken);

    const from = new Date(fakeClock.now().getTime() + 25 * 60 * 60 * 1000);
    const to = new Date(fakeClock.now().getTime() + 27 * 60 * 60 * 1000);
    const slots = await getAvailabilitySlots(app, doctorUserId, from, to);
    expect(slots.length).toBeGreaterThan(2);

    const appointmentAccepted = await createAppointment(
      app,
      prisma,
      patientA.accessToken,
      doctorUserId,
      slots[0].startAt,
    );

    const appointmentEarly = await createAppointment(
      app,
      prisma,
      patientB.accessToken,
      doctorUserId,
      slots[2].startAt,
    );

    const appointmentOnTime = await createAppointment(
      app,
      prisma,
      patientE.accessToken,
      doctorUserId,
      slots[1].startAt,
    );

    const listNow = new Date(Date.parse(slots[0].startAt) + 10 * 60 * 1000);

    fakeClock.setNow(new Date(Date.parse(slots[2].startAt) - 5 * 60 * 1000));
    await request(httpServer(app))
      .post('/api/v1/consultations/queue')
      .set('Authorization', `Bearer ${patientB.accessToken}`)
      .send({ doctorUserId, appointmentId: appointmentEarly.id })
      .expect(201);

    fakeClock.setNow(new Date(listNow.getTime() - 30 * 60 * 1000));
    const expiredQueue = await request(httpServer(app))
      .post('/api/v1/consultations/queue')
      .set('Authorization', `Bearer ${patientD.accessToken}`)
      .send({ doctorUserId, reason: 'Dolor agudo' })
      .expect(201);

    fakeClock.setNow(new Date(listNow.getTime() - 10 * 60 * 1000));
    const walkInQueue = await request(httpServer(app))
      .post('/api/v1/consultations/queue')
      .set('Authorization', `Bearer ${patientC.accessToken}`)
      .send({ doctorUserId, reason: 'Dolor agudo' })
      .expect(201);

    fakeClock.setNow(listNow);
    const acceptedQueue = await request(httpServer(app))
      .post('/api/v1/consultations/queue')
      .set('Authorization', `Bearer ${patientA.accessToken}`)
      .send({ doctorUserId, appointmentId: appointmentAccepted.id })
      .expect(201);

    await request(httpServer(app))
      .post(`/api/v1/consultations/queue/${acceptedQueue.body.id}/accept`)
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .expect(201);

    await request(httpServer(app))
      .post('/api/v1/consultations/queue')
      .set('Authorization', `Bearer ${patientE.accessToken}`)
      .send({ doctorUserId, appointmentId: appointmentOnTime.id })
      .expect(201);

    const listResponse = await request(httpServer(app))
      .get('/api/v1/consultations/queue')
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .expect(200);

    expect(listResponse.body[0].status).toBe('accepted');
    expect(listResponse.body[1].appointmentId).toBe(appointmentOnTime.id);
    expect(listResponse.body[2].appointmentId).toBe(appointmentEarly.id);
    expect(listResponse.body[3].id).toBe(walkInQueue.body.id);
    expect(listResponse.body[4].id).toBe(expiredQueue.body.id);
  });

  it('returns 401 without auth, 403 for wrong role, 409 for invalid transition', async () => {
    await request(httpServer(app))
      .get('/api/v1/consultations/queue')
      .expect(401);

    const doctor = await registerAndLogin(app, 'doctor');
    const doctorUserId = await getUserId(app, doctor.accessToken);
    await createDoctorProfile(app, doctor.accessToken);

    const patient = await registerAndLogin(app, 'patient');
    await createPatientProfile(app, patient.accessToken);

    const createResponse = await request(httpServer(app))
      .post('/api/v1/consultations/queue')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ doctorUserId, reason: 'Dolor agudo' })
      .expect(201);

    const queueId = createResponse.body.id as string;

    await request(httpServer(app))
      .post(`/api/v1/consultations/queue/${queueId}/accept`)
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .expect(403);

    await request(httpServer(app))
      .post(`/api/v1/consultations/queue/${queueId}/accept`)
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .expect(409);

    await request(httpServer(app))
      .post(`/api/v1/consultations/queue/${queueId}/cancel`)
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ reason: 'No puedo asistir' })
      .expect(201);
  });
});
