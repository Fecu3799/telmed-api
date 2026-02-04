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

describe('Doctor Payment Account (e2e)', () => {
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

  it('returns not_configured when no account exists', async () => {
    const doctor = await registerAndLogin(app, 'doctor');

    const response = await request(httpServer(app))
      .get('/api/v1/doctors/me/payment-account')
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .expect(200);

    expect(response.body.status).toBe('not_configured');
    expect(response.body.provider).toBe('mercadopago');
    expect(response.body.mode).toBe('dev');
  });

  it('connects and disconnects account in dev mode', async () => {
    const doctor = await registerAndLogin(app, 'doctor');
    await createDoctorProfile(app, doctor.accessToken);

    const connected = await request(httpServer(app))
      .put('/api/v1/doctors/me/payment-account')
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .send({ devLabel: 'mp-dev-seller-1' })
      .expect(200);

    expect(connected.body.status).toBe('connected');
    expect(connected.body.devLabel).toBe('mp-dev-seller-1');

    const disconnected = await request(httpServer(app))
      .post('/api/v1/doctors/me/payment-account/disconnect')
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .expect(200);

    expect(disconnected.body.status).toBe('disconnected');
    expect(disconnected.body.devLabel ?? null).toBeNull();
  });

  it('rejects non-doctor and unauthenticated access', async () => {
    const patient = await registerAndLogin(app, 'patient');

    await request(httpServer(app))
      .get('/api/v1/doctors/me/payment-account')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .expect(403);

    await request(httpServer(app))
      .get('/api/v1/doctors/me/payment-account')
      .expect(401);
  });
});
