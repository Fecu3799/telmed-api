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

describe('Doctor search (e2e)', () => {
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

  it('matches displayName first and falls back to legal name', async () => {
    const doctorA = await prisma.user.create({
      data: {
        email: `doc_a_${randomUUID()}@test.com`,
        passwordHash: 'hash',
        role: 'doctor',
        displayName: 'Dr. Alpha',
      },
    });

    const doctorB = await prisma.user.create({
      data: {
        email: `doc_b_${randomUUID()}@test.com`,
        passwordHash: 'hash',
        role: 'doctor',
      },
    });

    await prisma.doctorProfile.create({
      data: {
        userId: doctorA.id,
        priceCents: 100000,
        currency: 'ARS',
        firstName: 'Maria',
        lastName: 'Zeta',
      },
    });

    await prisma.doctorProfile.create({
      data: {
        userId: doctorB.id,
        priceCents: 90000,
        currency: 'ARS',
        firstName: 'Alpha',
        lastName: 'Perez',
      },
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/doctors/search')
      .query({ q: 'Dr. A' })
      .expect(200);

    expect(response.body.items.length).toBeGreaterThan(0);
    expect(response.body.items[0].doctorUserId).toBe(doctorA.id);

    const fallbackResponse = await request(app.getHttpServer())
      .get('/api/v1/doctors/search')
      .query({ q: 'Alpha' })
      .expect(200);

    const ids = fallbackResponse.body.items.map(
      (item: { doctorUserId: string }) => item.doctorUserId,
    );
    expect(ids).toEqual(expect.arrayContaining([doctorA.id, doctorB.id]));
  });

  it('filters by geo radius', async () => {
    const doctorA = await prisma.user.create({
      data: {
        email: `doc_geo_a_${randomUUID()}@test.com`,
        passwordHash: 'hash',
        role: 'doctor',
      },
    });

    const doctorB = await prisma.user.create({
      data: {
        email: `doc_geo_b_${randomUUID()}@test.com`,
        passwordHash: 'hash',
        role: 'doctor',
      },
    });

    await prisma.doctorProfile.create({
      data: {
        userId: doctorA.id,
        priceCents: 100000,
        currency: 'ARS',
      },
    });

    await prisma.doctorProfile.create({
      data: {
        userId: doctorB.id,
        priceCents: 100000,
        currency: 'ARS',
      },
    });

    await prisma.$executeRaw`
      UPDATE doctor_profiles
      SET location = ST_SetSRID(ST_MakePoint(-58.3816, -34.6037), 4326)::geography
      WHERE user_id = ${doctorA.id}
    `;

    await prisma.$executeRaw`
      UPDATE doctor_profiles
      SET location = ST_SetSRID(ST_MakePoint(-0.1276, 51.5072), 4326)::geography
      WHERE user_id = ${doctorB.id}
    `;

    const response = await request(app.getHttpServer())
      .get('/api/v1/doctors/search')
      .query({ lat: -34.6037, lng: -58.3816, radiusKm: 5 })
      .expect(200);

    const ids = response.body.items.map(
      (item: { doctorUserId: string }) => item.doctorUserId,
    );
    expect(ids).toEqual(expect.arrayContaining([doctorA.id]));
    expect(ids).not.toEqual(expect.arrayContaining([doctorB.id]));
  });

  it('paginates with cursor for relevance search', async () => {
    const doctorA = await prisma.user.create({
      data: {
        email: `doc_pg_a_${randomUUID()}@test.com`,
        passwordHash: 'hash',
        role: 'doctor',
        displayName: 'Dr. Alpha',
      },
    });
    const doctorB = await prisma.user.create({
      data: {
        email: `doc_pg_b_${randomUUID()}@test.com`,
        passwordHash: 'hash',
        role: 'doctor',
      },
    });
    const doctorC = await prisma.user.create({
      data: {
        email: `doc_pg_c_${randomUUID()}@test.com`,
        passwordHash: 'hash',
        role: 'doctor',
      },
    });

    await prisma.doctorProfile.create({
      data: {
        userId: doctorA.id,
        priceCents: 120000,
        currency: 'ARS',
        firstName: 'Ana',
        lastName: 'Alpha',
      },
    });
    await prisma.doctorProfile.create({
      data: {
        userId: doctorB.id,
        priceCents: 110000,
        currency: 'ARS',
        firstName: 'Alpha',
        lastName: 'Beta',
      },
    });
    await prisma.doctorProfile.create({
      data: {
        userId: doctorC.id,
        priceCents: 100000,
        currency: 'ARS',
        firstName: 'Gamma',
        lastName: 'Alpha',
      },
    });

    const firstPage = await request(app.getHttpServer())
      .get('/api/v1/doctors/search')
      .query({ q: 'Alpha', limit: 2 })
      .expect(200);

    expect(firstPage.body.items.length).toBe(2);
    expect(firstPage.body.pageInfo.nextCursor).toBeTruthy();

    const secondPage = await request(app.getHttpServer())
      .get('/api/v1/doctors/search')
      .query({
        q: 'Alpha',
        limit: 2,
        cursor: firstPage.body.pageInfo.nextCursor,
      })
      .expect(200);

    const firstIds = new Set(
      firstPage.body.items.map(
        (item: { doctorUserId: string }) => item.doctorUserId,
      ),
    );
    const secondIds = new Set(
      secondPage.body.items.map(
        (item: { doctorUserId: string }) => item.doctorUserId,
      ),
    );

    for (const id of secondIds) {
      expect(firstIds.has(id)).toBe(false);
    }
    expect(firstIds.size + secondIds.size).toBe(3);
  });

  it('sorts by price_desc', async () => {
    const doctorA = await prisma.user.create({
      data: {
        email: `doc_sort_a_${randomUUID()}@test.com`,
        passwordHash: 'hash',
        role: 'doctor',
      },
    });
    const doctorB = await prisma.user.create({
      data: {
        email: `doc_sort_b_${randomUUID()}@test.com`,
        passwordHash: 'hash',
        role: 'doctor',
      },
    });

    await prisma.doctorProfile.create({
      data: {
        userId: doctorA.id,
        priceCents: 50000,
        currency: 'ARS',
        firstName: 'Ana',
        lastName: 'Perez',
      },
    });
    await prisma.doctorProfile.create({
      data: {
        userId: doctorB.id,
        priceCents: 200000,
        currency: 'ARS',
        firstName: 'Bea',
        lastName: 'Perez',
      },
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/doctors/search')
      .query({ sort: 'price_desc', limit: 2 })
      .expect(200);

    expect(response.body.items[0].doctorUserId).toBe(doctorB.id);
  });
});
