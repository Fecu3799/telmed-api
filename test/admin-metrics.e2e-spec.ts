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
import { ensureTestEnv } from './helpers/ensure-test-env';
import { resetDb } from './helpers/reset-db';
import * as argon2 from 'argon2';

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

async function createAdmin(app: INestApplication, prisma: PrismaService) {
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

  return loginResponse.body.accessToken as string;
}

describe('Admin Metrics (e2e)', () => {
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

  it('admin can access overview, health and jobs', async () => {
    const adminToken = await createAdmin(app, prisma);

    const overview = await request(app.getHttpServer())
      .get('/api/v1/admin/metrics/overview')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(overview.body.users).toBeDefined();
    expect(overview.body.specialties).toBeDefined();

    const health = await request(app.getHttpServer())
      .get('/api/v1/admin/metrics/health')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(health.body.ok).toBeDefined();
    expect(health.body.checks?.db).toBeDefined();

    const jobs = await request(app.getHttpServer())
      .get('/api/v1/admin/metrics/jobs')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(jobs.body.queues).toBeDefined();
  });

  it('doctor cannot access admin metrics', async () => {
    const doctorToken = await registerAndLogin(app, 'doctor');

    await request(app.getHttpServer())
      .get('/api/v1/admin/metrics/overview')
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/v1/admin/metrics/health')
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/v1/admin/metrics/jobs')
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(403);
  });

  it('requires auth for admin metrics', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/metrics/overview')
      .expect(401);

    await request(app.getHttpServer())
      .get('/api/v1/admin/metrics/health')
      .expect(401);

    await request(app.getHttpServer())
      .get('/api/v1/admin/metrics/jobs')
      .expect(401);
  });
});
