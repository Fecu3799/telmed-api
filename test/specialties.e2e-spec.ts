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
import { PrismaService } from '../src/infra/prisma/prisma.service';
import * as argon2 from 'argon2';

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

describe('Specialties (e2e)', () => {
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

  afterAll(async () => {
    await app.close();
  });

  it('GET /specialties -> 200', async () => {
    await request(app.getHttpServer()).get('/api/v1/specialties').expect(200);
  });

  it('admin create + public list + soft delete', async () => {
    const adminEmail = `admin_${randomUUID()}@test.com`;
    const adminPassword = 'Passw0rd!123';
    const passwordHash = await argon2.hash(adminPassword);

    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        role: 'admin',
      },
    });

    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password: adminPassword })
      .expect(201);

    const adminToken = loginResponse.body.accessToken as string;
    const specialtyName = `Cardiologia_${randomUUID()}`;

    const createResponse = await request(app.getHttpServer())
      .post('/api/v1/admin/specialties')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: specialtyName })
      .expect(201);

    expect(createResponse.body.name).toBe(specialtyName);
    expect(createResponse.body.isActive).toBe(true);

    const listResponse = await request(app.getHttpServer())
      .get('/api/v1/specialties')
      .expect(200);

    const found = listResponse.body.find(
      (item: { id: string }) => item.id === createResponse.body.id,
    );
    expect(found).toBeTruthy();

    await request(app.getHttpServer())
      .delete(`/api/v1/admin/specialties/${createResponse.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const listAfterDelete = await request(app.getHttpServer())
      .get('/api/v1/specialties')
      .expect(200);

    const stillThere = listAfterDelete.body.find(
      (item: { id: string }) => item.id === createResponse.body.id,
    );
    expect(stillThere).toBeFalsy();
  });

  it('patient/doctor cannot access admin endpoints', async () => {
    const patientToken = await registerAndLogin(app, 'patient');
    const doctorToken = await registerAndLogin(app, 'doctor');

    await request(app.getHttpServer())
      .post('/api/v1/admin/specialties')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ name: 'Dermatologia' })
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/v1/admin/specialties')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ name: 'Clinica' })
      .expect(403);
  });
});
