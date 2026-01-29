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

  return loginResponse.body.accessToken as string;
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

describe('Doctor scheduling config + slots (e2e)', () => {
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

  it('allows doctor to get/update scheduling config and rejects invalid values', async () => {
    const doctorToken = await registerAndLogin(app, 'doctor');
    const patientToken = await registerAndLogin(app, 'patient');

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200);

    const doctorUserId = me.body.id as string;

    await createDoctorProfile(app, doctorToken);

    const getResponse = await request(app.getHttpServer())
      .get('/api/v1/doctors/me/scheduling-config')
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200);

    expect(getResponse.body.userId).toBe(doctorUserId);
    expect(getResponse.body.slotDurationMinutes).toBe(20);

    const patchResponse = await request(app.getHttpServer())
      .patch('/api/v1/doctors/me/scheduling-config')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ slotDurationMinutes: 30 })
      .expect(200);

    expect(patchResponse.body.slotDurationMinutes).toBe(30);

    await request(app.getHttpServer())
      .patch('/api/v1/doctors/me/scheduling-config')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ slotDurationMinutes: 17 })
      .expect(422);

    await request(app.getHttpServer())
      .get('/api/v1/doctors/me/scheduling-config')
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .patch('/api/v1/doctors/me/scheduling-config')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ slotDurationMinutes: 30 })
      .expect(403);
  });

  it('returns slots aligned to duration and marks booked slots', async () => {
    const doctorToken = await registerAndLogin(app, 'doctor');
    const patientToken = await registerAndLogin(app, 'patient');

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200);
    const doctorUserId = me.body.id as string;

    await createDoctorProfile(app, doctorToken);
    await createPatientIdentity(app, patientToken);

    const patientUser = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);
    const patientUserId = patientUser.body.id as string;

    const patient = await prisma.patient.findUniqueOrThrow({
      where: { userId: patientUserId },
      select: { id: true },
    });

    await prisma.doctorSchedulingConfig.upsert({
      where: { userId: doctorUserId },
      create: {
        userId: doctorUserId,
        slotDurationMinutes: 30,
        leadTimeHours: 24,
        horizonDays: 60,
        timezone: 'UTC',
      },
      update: { slotDurationMinutes: 30, timezone: 'UTC' },
    });

    const targetDate = new Date(Date.now() + 48 * 3600 * 1000);
    const dateStr = targetDate.toISOString().slice(0, 10);
    const dayOfWeek = new Date(`${dateStr}T00:00:00Z`).getUTCDay();

    await request(app.getHttpServer())
      .put('/api/v1/doctors/me/availability-rules')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        rules: [
          {
            dayOfWeek,
            startTime: '09:00',
            endTime: '11:00',
            isActive: true,
          },
        ],
      })
      .expect(200);

    const bookedStart = new Date(`${dateStr}T09:00:00.000Z`);
    const bookedEnd = new Date(`${dateStr}T09:30:00.000Z`);

    await prisma.appointment.create({
      data: {
        doctorUserId,
        patientId: patient.id,
        startAt: bookedStart,
        endAt: bookedEnd,
        status: 'confirmed',
        reason: 'Dolor',
      },
    });

    const from = `${dateStr}T00:00:00.000Z`;
    const to = `${dateStr}T23:59:59.000Z`;

    const slotsResponse = await request(app.getHttpServer())
      .get(`/api/v1/doctors/${doctorUserId}/slots`)
      .set('Authorization', `Bearer ${patientToken}`)
      .query({ from, to })
      .expect(200);

    const slots = slotsResponse.body.slots as Array<{
      startAt: string;
      endAt: string;
      status: string;
    }>;

    const bookedSlot = slots.find(
      (slot) =>
        slot.startAt === bookedStart.toISOString() &&
        slot.endAt === bookedEnd.toISOString(),
    );

    expect(bookedSlot?.status).toBe('booked');

    const slotCountBefore = slots.length;

    await request(app.getHttpServer())
      .patch('/api/v1/doctors/me/scheduling-config')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ slotDurationMinutes: 15 })
      .expect(200);

    const slotsAfterResponse = await request(app.getHttpServer())
      .get(`/api/v1/doctors/${doctorUserId}/slots`)
      .set('Authorization', `Bearer ${patientToken}`)
      .query({ from, to })
      .expect(200);

    expect(slotsAfterResponse.body.slotDurationMinutes).toBe(15);
    expect(slotsAfterResponse.body.slots.length).toBeGreaterThan(
      slotCountBefore,
    );
  });
});
