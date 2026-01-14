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

import { ensureTestEnv } from './helpers/ensure-test-env';

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

describe('Patient identity (e2e)', () => {
  let app: INestApplication<App>;

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
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('GET /patients/me/identity -> 404 before create', async () => {
    const token = await registerAndLogin(app, 'patient');

    await request(app.getHttpServer())
      .get('/api/v1/patients/me/identity')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('PATCH -> GET -> PATCH flow for patient identity', async () => {
    const token = await registerAndLogin(app, 'patient');

    await request(app.getHttpServer())
      .patch('/api/v1/patients/me/identity')
      .set('Authorization', `Bearer ${token}`)
      .send({
        legalFirstName: 'Juan',
        legalLastName: 'Perez',
        documentType: 'DNI',
        documentNumber: `30${Math.floor(Math.random() * 10000000)}`,
        documentCountry: 'AR',
        birthDate: '1990-05-10',
        phone: '+54 11 5555',
      })
      .expect(200);

    const getResponse = await request(app.getHttpServer())
      .get('/api/v1/patients/me/identity')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(getResponse.body.legalFirstName).toBe('Juan');
    expect(getResponse.body.legalLastName).toBe('Perez');

    const patchResponse = await request(app.getHttpServer())
      .patch('/api/v1/patients/me/identity')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '+54 11 4444' })
      .expect(200);

    expect(patchResponse.body.phone).toBe('+54 11 4444');
  });

  it('doctor token -> 403', async () => {
    const token = await registerAndLogin(app, 'doctor');

    await request(app.getHttpServer())
      .get('/api/v1/patients/me/identity')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });
});
