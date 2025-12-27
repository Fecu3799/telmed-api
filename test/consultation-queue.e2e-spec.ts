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

describe('Consultation queue (e2e)', () => {
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

  it('patient creates queue, doctor accepts, patient cancels', async () => {
    const doctor = await registerAndLogin(app, 'doctor');
    const doctorUserId = await getUserId(app, doctor.accessToken);
    await createDoctorProfile(app, doctor.accessToken);

    const patient = await registerAndLogin(app, 'patient');
    await createPatientProfile(app, patient.accessToken);

    const createResponse = await request(httpServer(app))
      .post('/api/v1/consultations/queue')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ doctorUserId })
      .expect(201);

    const queueId = createResponse.body.id as string;

    const acceptResponse = await request(httpServer(app))
      .post(`/api/v1/consultations/queue/${queueId}/accept`)
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .expect(201);

    expect(acceptResponse.body.status).toBe('accepted');

    const cancelResponse = await request(httpServer(app))
      .post(`/api/v1/consultations/queue/${queueId}/cancel`)
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ reason: 'No puedo asistir' })
      .expect(201);

    expect(cancelResponse.body.status).toBe('cancelled');
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
      .send({ doctorUserId })
      .expect(201);

    await request(httpServer(app))
      .post('/api/v1/consultations/queue')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ doctorUserId })
      .expect(409);
  });

  it('enforces ownership on GET', async () => {
    const doctor = await registerAndLogin(app, 'doctor');
    const doctorUserId = await getUserId(app, doctor.accessToken);
    await createDoctorProfile(app, doctor.accessToken);

    const patient = await registerAndLogin(app, 'patient');
    await createPatientProfile(app, patient.accessToken);

    const createResponse = await request(httpServer(app))
      .post('/api/v1/consultations/queue')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ doctorUserId })
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
      .send({ doctorUserId })
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
      .send({ doctorUserId })
      .expect(404);
  });
});
