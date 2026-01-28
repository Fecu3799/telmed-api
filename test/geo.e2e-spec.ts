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
import { RedisService } from '../src/infra/redis/redis.service';
import { ensureTestEnv } from './helpers/ensure-test-env';
import { resetDb } from './helpers/reset-db';

const ONLINE_GEO_KEY = 'geo:doctors:online';

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

  return loginResponse.body.accessToken as string;
}

async function getUserId(app: INestApplication, token: string) {
  const me = await request(httpServer(app))
    .get('/api/v1/auth/me')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  return me.body.id as string;
}

async function createDoctorProfile(
  app: INestApplication,
  token: string,
  location?: { lat: number; lng: number },
) {
  await request(httpServer(app))
    .put('/api/v1/doctors/me/profile')
    .set('Authorization', `Bearer ${token}`)
    .send({
      firstName: 'Ana',
      lastName: 'Test',
      bio: 'Cardiologa',
      priceCents: 120000,
      currency: 'ARS',
      ...(location ? { location } : {}),
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

async function clearGeoRedis(redis: RedisService) {
  const client = redis.getClient();
  const keys = await client.keys('geo:*');
  if (keys.length > 0) {
    await client.del(keys);
  }
}

describe('Geo emergency flows (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let redis: RedisService;

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
    redis = app.get(RedisService);
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await clearGeoRedis(redis);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('POST /doctors/me/geo/online -> 422 without location', async () => {
    const token = await registerAndLogin(app, 'doctor');

    await request(httpServer(app))
      .post('/api/v1/doctors/me/geo/online')
      .set('Authorization', `Bearer ${token}`)
      .expect(422);
  });

  it('stores geocoded fields when setting location', async () => {
    const token = await registerAndLogin(app, 'doctor');
    await createDoctorProfile(app, token, { lat: -34.6037, lng: -58.3816 });

    const profileResponse = await request(httpServer(app))
      .get('/api/v1/doctors/me/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(profileResponse.body.city).toBe('Test City');
    expect(profileResponse.body.region).toBe('Test Region');
    expect(profileResponse.body.countryCode).toBe('AR');
  });

  it('online/ping/offline updates Redis presence', async () => {
    const token = await registerAndLogin(app, 'doctor');
    await createDoctorProfile(app, token, { lat: -34.6037, lng: -58.3816 });
    const doctorId = await getUserId(app, token);

    await request(httpServer(app))
      .post('/api/v1/doctors/me/geo/online')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const client = redis.getClient();
    expect(await client.exists(`geo:doctor:${doctorId}:online`)).toBe(1);
    expect(await client.zscore(ONLINE_GEO_KEY, doctorId)).not.toBeNull();

    await request(httpServer(app))
      .post('/api/v1/doctors/me/geo/ping')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    await request(httpServer(app))
      .post('/api/v1/doctors/me/geo/offline')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    expect(await client.exists(`geo:doctor:${doctorId}:online`)).toBe(0);
    expect(await client.zscore(ONLINE_GEO_KEY, doctorId)).toBeNull();
  });

  it('nearby returns online doctors only', async () => {
    const doctorToken = await registerAndLogin(app, 'doctor');
    await createDoctorProfile(app, doctorToken, {
      lat: -34.6037,
      lng: -58.3816,
    });
    const doctorId = await getUserId(app, doctorToken);

    await request(httpServer(app))
      .post('/api/v1/doctors/me/geo/online')
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(201);

    const patientToken = await registerAndLogin(app, 'patient');
    await createPatientIdentity(app, patientToken);

    const nearbyResponse = await request(httpServer(app))
      .get('/api/v1/geo/doctors/nearby')
      .set('Authorization', `Bearer ${patientToken}`)
      .query({
        lat: -34.6037,
        lng: -58.3816,
        radiusMeters: 2000,
        page: 1,
        pageSize: 10,
      })
      .expect(200);

    expect(nearbyResponse.body.items).toHaveLength(1);
    expect(nearbyResponse.body.items[0].doctorUserId).toBe(doctorId);
    expect(nearbyResponse.body.items[0]).not.toHaveProperty('location');
    expect(nearbyResponse.body.items[0].city).toBe('Test City');
    expect(nearbyResponse.body.items[0].region).toBe('Test Region');
    expect(nearbyResponse.body.items[0].countryCode).toBe('AR');

    await request(httpServer(app))
      .post('/api/v1/doctors/me/geo/offline')
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(201);

    const afterOffline = await request(httpServer(app))
      .get('/api/v1/geo/doctors/nearby')
      .set('Authorization', `Bearer ${patientToken}`)
      .query({
        lat: -34.6037,
        lng: -58.3816,
        radiusMeters: 2000,
        page: 1,
        pageSize: 10,
      })
      .expect(200);

    expect(afterOffline.body.items).toHaveLength(0);
  });

  it('geo emergencies enforce doctor limit and cancel siblings', async () => {
    const patientToken = await registerAndLogin(app, 'patient');
    await createPatientIdentity(app, patientToken);

    const doctorTokens = await Promise.all([
      registerAndLogin(app, 'doctor'),
      registerAndLogin(app, 'doctor'),
      registerAndLogin(app, 'doctor'),
      registerAndLogin(app, 'doctor'),
    ]);

    const doctorIds: string[] = [];
    for (const token of doctorTokens) {
      await createDoctorProfile(app, token, { lat: -34.6037, lng: -58.3816 });
      await request(httpServer(app))
        .post('/api/v1/doctors/me/geo/online')
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      doctorIds.push(await getUserId(app, token));
    }

    await request(httpServer(app))
      .post('/api/v1/geo/emergencies')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        doctorIds: doctorIds.slice(0, 4),
        patientLocation: { lat: -34.6037, lng: -58.3816 },
      })
      .expect(422);

    const createResponse = await request(httpServer(app))
      .post('/api/v1/geo/emergencies')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        doctorIds: doctorIds.slice(0, 2),
        patientLocation: { lat: -34.6037, lng: -58.3816 },
        note: 'Dolor fuerte',
      })
      .expect(201);

    const [firstRequest, secondRequest] = createResponse.body.requests;

    await request(httpServer(app))
      .post(`/api/v1/consultations/queue/${firstRequest.queueItemId}/accept`)
      .set('Authorization', `Bearer ${doctorTokens[0]}`)
      .expect(201);

    const secondQueue = await request(httpServer(app))
      .get(`/api/v1/consultations/queue/${secondRequest.queueItemId}`)
      .set('Authorization', `Bearer ${doctorTokens[1]}`)
      .expect(200);

    expect(secondQueue.body.status).toBe('cancelled');
  });

  it('geo emergencies block double accept', async () => {
    const patientToken = await registerAndLogin(app, 'patient');
    await createPatientIdentity(app, patientToken);

    const doctorTokenA = await registerAndLogin(app, 'doctor');
    const doctorTokenB = await registerAndLogin(app, 'doctor');

    await createDoctorProfile(app, doctorTokenA, {
      lat: -34.6037,
      lng: -58.3816,
    });
    await request(httpServer(app))
      .post('/api/v1/doctors/me/geo/online')
      .set('Authorization', `Bearer ${doctorTokenA}`)
      .expect(201);
    await createDoctorProfile(app, doctorTokenB, {
      lat: -34.6037,
      lng: -58.3816,
    });
    await request(httpServer(app))
      .post('/api/v1/doctors/me/geo/online')
      .set('Authorization', `Bearer ${doctorTokenB}`)
      .expect(201);

    const doctorIdA = await getUserId(app, doctorTokenA);
    const doctorIdB = await getUserId(app, doctorTokenB);

    const createResponse = await request(httpServer(app))
      .post('/api/v1/geo/emergencies')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        doctorIds: [doctorIdA, doctorIdB],
        patientLocation: { lat: -34.6037, lng: -58.3816 },
        note: 'Urgente',
      })
      .expect(201);

    const requests = createResponse.body.requests as Array<{
      doctorId: string;
      queueItemId: string;
    }>;
    const requestForDoctorA = requests.find(
      (item) => item.doctorId === doctorIdA,
    )!;
    const requestForDoctorB = requests.find(
      (item) => item.doctorId === doctorIdB,
    )!;

    await request(httpServer(app))
      .post(
        `/api/v1/consultations/queue/${requestForDoctorA.queueItemId}/accept`,
      )
      .set('Authorization', `Bearer ${doctorTokenA}`)
      .expect(201);

    await request(httpServer(app))
      .post(
        `/api/v1/consultations/queue/${requestForDoctorB.queueItemId}/accept`,
      )
      .set('Authorization', `Bearer ${doctorTokenB}`)
      .expect(409);
  });

  it('geo emergencies enforce quota limits', async () => {
    process.env.GEO_EMERGENCY_DAILY_LIMIT = '1';
    process.env.GEO_EMERGENCY_MONTHLY_LIMIT = '1';

    const patientToken = await registerAndLogin(app, 'patient');
    await createPatientIdentity(app, patientToken);

    const doctorToken = await registerAndLogin(app, 'doctor');
    await createDoctorProfile(app, doctorToken, {
      lat: -34.6037,
      lng: -58.3816,
    });
    await request(httpServer(app))
      .post('/api/v1/doctors/me/geo/online')
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(201);
    const doctorId = await getUserId(app, doctorToken);

    await request(httpServer(app))
      .post('/api/v1/geo/emergencies')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        doctorIds: [doctorId],
        patientLocation: { lat: -34.6037, lng: -58.3816 },
        note: 'Dolor fuerte',
      })
      .expect(201);

    await request(httpServer(app))
      .post('/api/v1/geo/emergencies')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        doctorIds: [doctorId],
        patientLocation: { lat: -34.6037, lng: -58.3816 },
        note: 'Dolor fuerte',
      })
      .expect(409)
      .expect((response) => {
        expect(response.body.type).toBe(
          'https://telmed/errors/emergency-limit-reached',
        );
        expect(response.body.status).toBe(409);
        expect(response.body.extensions?.code).toBe('emergency_limit_reached');
        expect(response.body.extensions?.retryAfterSeconds).toBeGreaterThan(0);
        expect(response.body.extensions?.resetAt).toBeTruthy();
      });
  });
});
