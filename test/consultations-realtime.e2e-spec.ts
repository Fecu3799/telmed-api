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
import { io, Socket } from 'socket.io-client';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { mapValidationErrors } from '../src/common/utils/validation-errors';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { resetDb } from './helpers/reset-db';
import { CLOCK } from '../src/common/clock/clock';
import { FakeClock } from './utils/fake-clock';

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
  role: 'patient' | 'doctor' | 'admin',
) {
  const email = `user_${randomUUID()}@test.com`;
  const password = 'Passw0rd!123';

  if (role !== 'admin') {
    await request(httpServer(app))
      .post('/api/v1/auth/register')
      .send({ email, password, role })
      .expect(201);
  } else {
    await request(httpServer(app))
      .post('/api/v1/auth/register')
      .send({ email, password, role: 'patient' })
      .expect(201);
    // Promote to admin directly for test purposes.
  }

  if (role === 'admin') {
    const prisma = app.get(PrismaService);
    await prisma.user.update({
      where: { email },
      data: { role: 'admin' },
    });
  }

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

async function createInProgressConsultation(
  app: INestApplication,
  prisma: PrismaService,
  fakeClock: FakeClock,
  doctorToken: string,
  patientToken: string,
) {
  const { appointmentId, doctorUserId, startAt } = await createAppointment(
    app,
    prisma,
    doctorToken,
    patientToken,
  );

  fakeClock.setNow(new Date(Date.parse(startAt) - 5 * 60 * 1000));

  const queueResponse = await request(httpServer(app))
    .post('/api/v1/consultations/queue')
    .set('Authorization', `Bearer ${patientToken}`)
    .send({ doctorUserId, appointmentId })
    .expect(201);

  const queueItemId = queueResponse.body.id as string;

  const startResponse = await request(httpServer(app))
    .post(`/api/v1/consultations/queue/${queueItemId}/start`)
    .set('Authorization', `Bearer ${doctorToken}`)
    .expect(201);

  return {
    consultationId: startResponse.body.consultation.id as string,
    queueItemId,
  };
}

function waitForAck<T>(
  fn: (resolve: (value: T) => void, reject: (error: Error) => void) => void,
  timeoutMs = 5000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timed out waiting for ACK'));
    }, timeoutMs);
    fn(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

describe('Consultations realtime (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let baseUrl: string;
  let fakeClock: FakeClock;

  beforeAll(async () => {
    ensureEnv();

    fakeClock = new FakeClock(new Date());

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
    await app.listen(0);
    prisma = app.get(PrismaService);

    const address = httpServer(app).address();
    const port = typeof address === 'string' ? 3000 : (address?.port ?? 3000);
    baseUrl = `http://127.0.0.1:${port}`;
  });

  beforeEach(async () => {
    await resetDb(prisma);
    fakeClock.setNow(new Date());
  });

  afterAll(async () => {
    await app.close();
  });

  it('issues livekit token for participants and blocks admin', async () => {
    const doctor = await registerAndLogin(app, 'doctor');
    const patient = await registerAndLogin(app, 'patient');
    const admin = await registerAndLogin(app, 'admin');

    const { consultationId } = await createInProgressConsultation(
      app,
      prisma,
      fakeClock,
      doctor.accessToken,
      patient.accessToken,
    );

    await request(httpServer(app))
      .post(`/api/v1/consultations/${consultationId}/livekit-token`)
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .expect(201);

    await request(httpServer(app))
      .post(`/api/v1/consultations/${consultationId}/livekit-token`)
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .expect(201);

    await request(httpServer(app))
      .post(`/api/v1/consultations/${consultationId}/livekit-token`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(403);
  });

  it('handles realtime chat and file uploads', async () => {
    const doctor = await registerAndLogin(app, 'doctor');
    const patient = await registerAndLogin(app, 'patient');

    const { consultationId } = await createInProgressConsultation(
      app,
      prisma,
      fakeClock,
      doctor.accessToken,
      patient.accessToken,
    );

    const doctorSocket = io(`${baseUrl}/consultations`, {
      auth: { token: doctor.accessToken },
      transports: ['websocket'],
    });
    const patientSocket = io(`${baseUrl}/consultations`, {
      auth: { token: patient.accessToken },
      transports: ['websocket'],
    });

    await waitForAck<void>((resolve, reject) => {
      doctorSocket.emit(
        'consultation.join',
        { consultationId },
        (response: { ok: boolean }) => {
          if (response?.ok) {
            resolve();
          } else {
            reject(new Error('Join failed'));
          }
        },
      );
    });

    await waitForAck<void>((resolve, reject) => {
      patientSocket.emit(
        'consultation.join',
        { consultationId },
        (response: { ok: boolean }) => {
          if (response?.ok) {
            resolve();
          } else {
            reject(new Error('Join failed'));
          }
        },
      );
    });

    const messageCreated = new Promise<{ id: string }>((resolve) => {
      patientSocket.on('chat.message_created', (payload) => {
        resolve(payload.message);
      });
    });

    await waitForAck<void>((resolve, reject) => {
      doctorSocket.emit(
        'chat.send',
        { consultationId, clientMsgId: 'msg-1', text: 'Hola' },
        (response: { ok: boolean }) => {
          if (response?.ok) {
            resolve();
          } else {
            reject(new Error('Send failed'));
          }
        },
      );
    });

    const createdMessage = await messageCreated;

    await waitForAck<void>((resolve, reject) => {
      patientSocket.emit(
        'chat.delivered',
        { consultationId, messageId: createdMessage.id },
        (response: { ok: boolean }) => {
          if (response?.ok) {
            resolve();
          } else {
            reject(new Error('Delivered failed'));
          }
        },
      );
    });

    const messagesResponse = await request(httpServer(app))
      .get(`/api/v1/consultations/${consultationId}/messages`)
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .expect(200);

    expect(messagesResponse.body.items.length).toBeGreaterThan(0);

    const prepareResponse = await request(httpServer(app))
      .post(`/api/v1/consultations/${consultationId}/files/prepare`)
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .send({
        filename: 'informe.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2048,
      })
      .expect(201);

    const fileId = prepareResponse.body.fileId as string;

    const confirmResponse = await request(httpServer(app))
      .post(`/api/v1/consultations/${consultationId}/files/confirm`)
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .send({ fileId })
      .expect(201);

    expect(confirmResponse.body.kind).toBe('file');

    await request(httpServer(app))
      .get(`/api/v1/consultations/${consultationId}/files/${fileId}/download`)
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .expect(200);

    doctorSocket.close();
    patientSocket.close();
  });
});
