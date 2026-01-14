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

describe('Doctor profiles (e2e)', () => {
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

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('GET /doctors/me/profile -> 404 before create', async () => {
    const token = await registerAndLogin(app, 'doctor');

    await request(app.getHttpServer())
      .get('/api/v1/doctors/me/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('PUT -> GET -> PATCH flow for doctor profile', async () => {
    const token = await registerAndLogin(app, 'doctor');

    await request(app.getHttpServer())
      .put('/api/v1/doctors/me/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({
        firstName: 'Maria',
        lastName: 'Gonzalez',
        priceCents: 150000,
        bio: 'Cardiologo',
        location: { lat: 0, lng: 0 },
      })
      .expect(200);

    const getResponse = await request(app.getHttpServer())
      .get('/api/v1/doctors/me/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(getResponse.body.priceCents).toBe(150000);

    const patchResponse = await request(app.getHttpServer())
      .patch('/api/v1/doctors/me/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ priceCents: 175000 })
      .expect(200);

    expect(patchResponse.body.priceCents).toBe(175000);
  });

  it('PUT specialties -> GET reflects changes', async () => {
    const token = await registerAndLogin(app, 'doctor');

    await request(app.getHttpServer())
      .put('/api/v1/doctors/me/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ priceCents: 100000, firstName: 'Ana', lastName: 'Perez' })
      .expect(200);

    const specialtyA = await prisma.specialty.create({
      data: { name: `Cardiologia_${randomUUID()}` },
    });
    const specialtyB = await prisma.specialty.create({
      data: { name: `Clinica_${randomUUID()}` },
    });

    await request(app.getHttpServer())
      .put('/api/v1/doctors/me/specialties')
      .set('Authorization', `Bearer ${token}`)
      .send({ specialtyIds: [specialtyA.id, specialtyB.id] })
      .expect(200);

    const getResponse = await request(app.getHttpServer())
      .get('/api/v1/doctors/me/specialties')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const ids = getResponse.body.specialties.map(
      (item: { id: string }) => item.id,
    );
    expect(ids).toEqual(expect.arrayContaining([specialtyA.id, specialtyB.id]));
  });

  it('patient token -> 403', async () => {
    const token = await registerAndLogin(app, 'patient');

    await request(app.getHttpServer())
      .get('/api/v1/doctors/me/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });
});
