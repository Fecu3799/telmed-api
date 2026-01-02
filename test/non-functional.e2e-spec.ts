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
import { MERCADOPAGO_CLIENT } from '../src/modules/payments/mercadopago.client';
import { FakeMercadoPagoClient } from './utils/fake-mercadopago-client';
import { RateLimitService } from '../src/infra/rate-limit/rate-limit.service';

let previousRateLimit: string | undefined;

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

describe('Non-functional requirements (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let rateLimit: RateLimitService;

  beforeAll(async () => {
    ensureEnv();
    previousRateLimit = process.env.RATE_LIMIT_ENABLED;
    process.env.RATE_LIMIT_ENABLED = 'true';

    const fakeMp = new FakeMercadoPagoClient();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
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
    rateLimit = app.get(RateLimitService);
  });

  beforeEach(async () => {
    await resetDb(prisma);
    rateLimit.clear();
  });

  afterAll(async () => {
    process.env.RATE_LIMIT_ENABLED = previousRateLimit;
    await app.close();
  });

  it('echoes X-Trace-Id and generates one when absent', async () => {
    const traceId = 'trace-test-1';
    const response = await request(httpServer(app))
      .get('/api/v1/specialties')
      .set('X-Trace-Id', traceId)
      .expect(200);

    expect(response.header['x-trace-id']).toBe(traceId);

    const responseNoHeader = await request(httpServer(app))
      .get('/api/v1/specialties')
      .expect(200);

    expect(responseNoHeader.header['x-trace-id']).toBeTruthy();
  });

  it('logs audit entries for identity read/write', async () => {
    const patient = await registerAndLogin(app, 'patient');

    const createIdentity = await request(httpServer(app))
      .patch('/api/v1/patients/me/identity')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({
        legalFirstName: 'Juan',
        legalLastName: 'Paciente',
        documentType: 'DNI',
        documentNumber: `30${Math.floor(Math.random() * 10000000)}`,
        documentCountry: 'AR',
        birthDate: '1990-05-10',
      })
      .expect(200);

    const identityId = createIdentity.body.id as string;

    const traceId = 'trace-identity-read';
    await request(httpServer(app))
      .get('/api/v1/patients/me/identity')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .set('X-Trace-Id', traceId)
      .expect(200);

    const auditLogs = await prisma.auditLog.findMany({
      where: { resourceId: identityId },
    });

    const actions = auditLogs.map((entry) => entry.action);
    expect(actions).toContain('WRITE');
    expect(actions).toContain('READ');

    const readLog = auditLogs.find((entry) => entry.action === 'READ');
    expect(readLog?.traceId).toBe(traceId);
  });

  it('logs audit entries for enable-payment', async () => {
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

    const enable = await request(httpServer(app))
      .post(`/api/v1/consultations/queue/${queue.body.id}/enable-payment`)
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .expect(201);

    const auditLog = await prisma.auditLog.findFirst({
      where: {
        resourceType: 'Payment',
        resourceId: enable.body.id as string,
      },
    });

    expect(auditLog).toBeTruthy();
    expect(auditLog?.action).toBe('WRITE');
  });

  it('rate limits auth login after limit is exceeded', async () => {
    const email = `user_${randomUUID()}@test.com`;
    const password = 'Passw0rd!123';

    await request(httpServer(app))
      .post('/api/v1/auth/register')
      .send({ email, password, role: 'patient' })
      .expect(201);

    for (let i = 0; i < 10; i += 1) {
      await request(httpServer(app))
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(201);
    }

    await request(httpServer(app))
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(429);
  });
});
