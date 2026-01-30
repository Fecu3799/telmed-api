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

describe('Specialties (e2e)', () => {
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

  it('GET /specialties -> 200', async () => {
    await request(app.getHttpServer()).get('/api/v1/specialties').expect(200);
  });

  it('public list returns only active and ordered by sortOrder/name', async () => {
    const adminToken = await createAdmin(app, prisma);

    const activeA = await request(app.getHttpServer())
      .post('/api/v1/admin/specialties')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Beta',
        slug: `beta-${randomUUID().slice(0, 8)}`,
        sortOrder: 2,
        isActive: true,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/admin/specialties')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Alpha',
        slug: `alpha-${randomUUID().slice(0, 8)}`,
        sortOrder: 1,
        isActive: true,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/admin/specialties')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Inactive',
        slug: `inactive-${randomUUID().slice(0, 8)}`,
        sortOrder: 0,
        isActive: false,
      })
      .expect(201);

    const listResponse = await request(app.getHttpServer())
      .get('/api/v1/specialties')
      .expect(200);

    const ids = listResponse.body.map((item: { id: string }) => item.id);
    expect(ids).toEqual(expect.arrayContaining([activeA.body.id]));
    expect(ids.length).toBe(2);
    expect(listResponse.body[0].name).toBe('Alpha');
    expect(listResponse.body[1].name).toBe('Beta');
  });

  it('admin list supports pagination and isActive filter', async () => {
    const adminToken = await createAdmin(app, prisma);

    const createActive = await request(app.getHttpServer())
      .post('/api/v1/admin/specialties')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Cardiologia',
        slug: `cardiologia-${randomUUID().slice(0, 8)}`,
        sortOrder: 1,
        isActive: true,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/admin/specialties')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Dermatologia',
        slug: `dermatologia-${randomUUID().slice(0, 8)}`,
        sortOrder: 2,
        isActive: false,
      })
      .expect(201);

    const pageResponse = await request(app.getHttpServer())
      .get('/api/v1/admin/specialties')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ page: 1, pageSize: 1 })
      .expect(200);

    expect(pageResponse.body.items.length).toBe(1);
    expect(pageResponse.body.pageInfo.page).toBe(1);
    expect(pageResponse.body.pageInfo.pageSize).toBe(1);

    const activeResponse = await request(app.getHttpServer())
      .get('/api/v1/admin/specialties')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ isActive: true })
      .expect(200);

    const activeIds = activeResponse.body.items.map(
      (item: { id: string }) => item.id,
    );
    expect(activeIds).toContain(createActive.body.id);
    expect(activeIds.length).toBe(1);
  });

  it('admin create/update/activate/deactivate works and conflicts are 409', async () => {
    const adminToken = await createAdmin(app, prisma);

    const specialtyName = `Cardiologia_${randomUUID().slice(0, 8)}`;
    const slug = `cardiologia-${randomUUID().slice(0, 8)}`;

    const createResponse = await request(app.getHttpServer())
      .post('/api/v1/admin/specialties')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: specialtyName, slug, sortOrder: 3 })
      .expect(201);

    expect(createResponse.body.name).toBe(specialtyName);
    expect(createResponse.body.slug).toBe(slug);
    expect(createResponse.body.isActive).toBe(true);

    const dupNameResponse = await request(app.getHttpServer())
      .post('/api/v1/admin/specialties')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: specialtyName, slug: `dup-${slug}` })
      .expect(409);

    expect(dupNameResponse.body.type).toBe(
      'https://telmed/errors/specialty-conflict',
    );
    expect(dupNameResponse.body.extensions?.code).toBe('specialty_conflict');

    const dupSlugResponse = await request(app.getHttpServer())
      .post('/api/v1/admin/specialties')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `Other_${randomUUID()}`, slug })
      .expect(409);

    expect(dupSlugResponse.body.extensions?.code).toBe('specialty_conflict');

    const updateResponse = await request(app.getHttpServer())
      .patch(`/api/v1/admin/specialties/${createResponse.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sortOrder: 10 })
      .expect(200);

    expect(updateResponse.body.sortOrder).toBe(10);

    const deactivated = await request(app.getHttpServer())
      .post(`/api/v1/admin/specialties/${createResponse.body.id}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(deactivated.body.isActive).toBe(false);

    const activated = await request(app.getHttpServer())
      .post(`/api/v1/admin/specialties/${createResponse.body.id}/activate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(activated.body.isActive).toBe(true);

    const listResponse = await request(app.getHttpServer())
      .get('/api/v1/specialties')
      .expect(200);

    const found = listResponse.body.find(
      (item: { id: string }) => item.id === createResponse.body.id,
    );
    expect(found).toBeTruthy();
  });

  it('patient/doctor cannot access admin endpoints', async () => {
    const patientToken = await registerAndLogin(app, 'patient');
    const doctorToken = await registerAndLogin(app, 'doctor');

    await request(app.getHttpServer())
      .post('/api/v1/admin/specialties')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ name: 'Dermatologia', slug: 'dermatologia' })
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/v1/admin/specialties')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ name: 'Clinica', slug: 'clinica' })
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/v1/admin/specialties')
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/v1/admin/specialties')
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(403);
  });
});
