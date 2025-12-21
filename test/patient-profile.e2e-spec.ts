import {
  HttpStatus,
  INestApplication,
  UnprocessableEntityException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { mapValidationErrors } from '../src/common/utils/validation-errors';

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

async function registerAndLogin(
  app: INestApplication,
  role: 'patient' | 'doctor',
) {
  const email = `user_${randomUUID()}@test.com`;
  const password = 'Passw0rd!123';

  await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({ email, password, role })
    .expect(201);

  const loginResponse = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(201);

  return loginResponse.body.accessToken as string;
}

describe('Patient profiles (e2e)', () => {
  let app: INestApplication<App>;

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
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /patients/me/profile -> 404 before create', async () => {
    const token = await registerAndLogin(app, 'patient');

    await request(app.getHttpServer())
      .get('/api/v1/patients/me/profile')
      .set('Authorization', `Bearer ${token}`)
      //.expect(404);
      .expect(404);
  });

  it('PUT -> GET -> PATCH flow for patient profile', async () => {
    const token = await registerAndLogin(app, 'patient');

    await request(app.getHttpServer())
      .put('/api/v1/patients/me/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Juan', lastName: 'Perez', phone: '+54 11 5555' })
      .expect(200);

    const getResponse = await request(app.getHttpServer())
      .get('/api/v1/patients/me/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(getResponse.body.firstName).toBe('Juan');
    expect(getResponse.body.lastName).toBe('Perez');

    const patchResponse = await request(app.getHttpServer())
      .patch('/api/v1/patients/me/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '+54 11 4444' })
      .expect(200);

    expect(patchResponse.body.phone).toBe('+54 11 4444');
  });

  it('doctor token -> 403', async () => {
    const token = await registerAndLogin(app, 'doctor');

    await request(app.getHttpServer())
      .get('/api/v1/patients/me/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });
});
