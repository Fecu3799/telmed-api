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
import { CLOCK } from '../src/common/clock/clock';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { mapValidationErrors } from '../src/common/utils/validation-errors';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { PaymentKind, PaymentProvider, PaymentStatus } from '@prisma/client';
import { calculatePlatformFee } from '../src/modules/payments/fee-calculator';
import { resetDb } from './helpers/reset-db';
import { ensureTestEnv } from './helpers/ensure-test-env';
import { FakeClock } from './utils/fake-clock';

const BASE_TIME = new Date('2025-01-20T12:00:00.000Z');

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

async function createPayment(input: {
  prisma: PrismaService;
  doctorUserId: string;
  patientUserId: string;
  status: PaymentStatus;
  grossAmountCents: number;
  createdAt: Date;
  updatedAt: Date;
  kind?: PaymentKind;
}) {
  const fee = calculatePlatformFee(input.grossAmountCents);
  return input.prisma.payment.create({
    data: {
      provider: PaymentProvider.mercadopago,
      kind: input.kind ?? PaymentKind.appointment,
      status: input.status,
      grossAmountCents: input.grossAmountCents,
      platformFeeCents: fee.platformFeeCents,
      totalChargedCents: fee.totalChargedCents,
      commissionRateBps: fee.commissionRateBps,
      currency: 'ARS',
      doctorUserId: input.doctorUserId,
      patientUserId: input.patientUserId,
      checkoutUrl: `https://checkout.test/${randomUUID()}`,
      providerPreferenceId: `pref_${randomUUID()}`,
      expiresAt: new Date(input.createdAt.getTime() + 60 * 60 * 1000),
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    },
  });
}

describe('Doctor Dashboard (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fakeClock: FakeClock;

  beforeAll(async () => {
    ensureTestEnv();

    fakeClock = new FakeClock(new Date(BASE_TIME));

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CLOCK)
      .useValue(fakeClock)
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
  });

  beforeEach(async () => {
    await resetDb(prisma);
    fakeClock.setNow(new Date(BASE_TIME));
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('returns overview metrics for doctor within range', async () => {
    const doctor = await registerAndLogin(app, 'doctor');
    const doctorUserId = await getUserId(app, doctor.accessToken);

    const patientA = await registerAndLogin(app, 'patient');
    const patientAUserId = await getUserId(app, patientA.accessToken);

    const patientB = await registerAndLogin(app, 'patient');
    const patientBUserId = await getUserId(app, patientB.accessToken);

    const now = fakeClock.now();
    const recentA = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const recentB = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
    const oldDate = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);

    await createPayment({
      prisma,
      doctorUserId,
      patientUserId: patientAUserId,
      status: PaymentStatus.paid,
      grossAmountCents: 100000,
      createdAt: recentA,
      updatedAt: recentA,
    });

    await createPayment({
      prisma,
      doctorUserId,
      patientUserId: patientAUserId,
      status: PaymentStatus.paid,
      grossAmountCents: 50000,
      createdAt: recentB,
      updatedAt: recentB,
    });

    await createPayment({
      prisma,
      doctorUserId,
      patientUserId: patientBUserId,
      status: PaymentStatus.paid,
      grossAmountCents: 20000,
      createdAt: oldDate,
      updatedAt: oldDate,
    });

    await createPayment({
      prisma,
      doctorUserId,
      patientUserId: patientBUserId,
      status: PaymentStatus.pending,
      grossAmountCents: 80000,
      createdAt: recentA,
      updatedAt: recentA,
    });

    const response = await request(httpServer(app))
      .get('/api/v1/doctors/me/dashboard/overview')
      .query({ range: '7d' })
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .expect(200);

    expect(response.body.range).toBe('7d');
    expect(response.body.currency).toBe('ARS');
    expect(response.body.kpis.grossEarningsCents).toBe(150000);
    expect(response.body.kpis.platformFeesCents).toBe(22500);
    expect(response.body.kpis.totalChargedCents).toBe(172500);
    expect(response.body.kpis.paidPaymentsCount).toBe(2);
    expect(response.body.kpis.uniquePatientsCount).toBe(1);
  });

  it('rejects overview for non-doctor and invalid range', async () => {
    const doctor = await registerAndLogin(app, 'doctor');
    const patient = await registerAndLogin(app, 'patient');

    await request(httpServer(app))
      .get('/api/v1/doctors/me/dashboard/overview')
      .query({ range: '7d' })
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .expect(403);

    const invalidRange = await request(httpServer(app))
      .get('/api/v1/doctors/me/dashboard/overview')
      .query({ range: '90d' })
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .expect(422);

    expect(invalidRange.body.extensions?.code).toBe('invalid_range');
  });

  it('lists doctor payments with status filter and pagination', async () => {
    const doctor = await registerAndLogin(app, 'doctor');
    const doctorUserId = await getUserId(app, doctor.accessToken);

    const patient = await registerAndLogin(app, 'patient');
    const patientUserId = await getUserId(app, patient.accessToken);

    const otherDoctor = await registerAndLogin(app, 'doctor');
    const otherDoctorUserId = await getUserId(app, otherDoctor.accessToken);

    const now = fakeClock.now();
    const recentDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

    await createPayment({
      prisma,
      doctorUserId,
      patientUserId,
      status: PaymentStatus.paid,
      grossAmountCents: 120000,
      createdAt: recentDate,
      updatedAt: recentDate,
    });

    await createPayment({
      prisma,
      doctorUserId,
      patientUserId,
      status: PaymentStatus.pending,
      grossAmountCents: 90000,
      createdAt: recentDate,
      updatedAt: recentDate,
    });

    await createPayment({
      prisma,
      doctorUserId,
      patientUserId,
      status: PaymentStatus.cancelled,
      grossAmountCents: 60000,
      createdAt: recentDate,
      updatedAt: recentDate,
    });

    await createPayment({
      prisma,
      doctorUserId: otherDoctorUserId,
      patientUserId,
      status: PaymentStatus.paid,
      grossAmountCents: 70000,
      createdAt: recentDate,
      updatedAt: recentDate,
    });

    const paidResponse = await request(httpServer(app))
      .get('/api/v1/doctors/me/payments')
      .query({ range: '30d', status: 'paid', page: 1, pageSize: 20 })
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .expect(200);

    expect(paidResponse.body.items).toHaveLength(1);
    expect(paidResponse.body.items[0].status).toBe('paid');
    expect(paidResponse.body.pageInfo.totalItems).toBe(1);

    const pendingResponse = await request(httpServer(app))
      .get('/api/v1/doctors/me/payments')
      .query({ range: '30d', status: 'pending', page: 1, pageSize: 20 })
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .expect(200);

    expect(pendingResponse.body.items).toHaveLength(1);
    expect(pendingResponse.body.items[0].status).toBe('pending');

    const cancelledResponse = await request(httpServer(app))
      .get('/api/v1/doctors/me/payments')
      .query({ range: '30d', status: 'cancelled', page: 1, pageSize: 20 })
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .expect(200);

    expect(cancelledResponse.body.items).toHaveLength(1);
    expect(cancelledResponse.body.items[0].status).toBe('cancelled');
  });
});
