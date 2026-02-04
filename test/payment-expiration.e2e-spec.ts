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
import { ConsultationQueuePaymentStatus, PaymentStatus } from '@prisma/client';
import { MERCADOPAGO_CLIENT } from '../src/modules/payments/mercadopago.client';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { resetDb } from './helpers/reset-db';
import { ensureTestEnv } from './helpers/ensure-test-env';
import { FakeClock } from './utils/fake-clock';
import { FakeMercadoPagoClient } from './utils/fake-mercadopago-client';

const BASE_TIME = new Date('2025-01-05T10:00:00.000Z');

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

async function setAvailabilityRules(app: INestApplication, token: string) {
  await request(httpServer(app))
    .put('/api/v1/doctors/me/availability-rules')
    .set('Authorization', `Bearer ${token}`)
    .send({
      rules: [
        { dayOfWeek: 0, startTime: '00:00', endTime: '23:59', isActive: true },
        { dayOfWeek: 1, startTime: '00:00', endTime: '23:59', isActive: true },
        { dayOfWeek: 2, startTime: '00:00', endTime: '23:59', isActive: true },
        { dayOfWeek: 3, startTime: '00:00', endTime: '23:59', isActive: true },
        { dayOfWeek: 4, startTime: '00:00', endTime: '23:59', isActive: true },
        { dayOfWeek: 5, startTime: '00:00', endTime: '23:59', isActive: true },
        { dayOfWeek: 6, startTime: '00:00', endTime: '23:59', isActive: true },
      ],
    })
    .expect(200);
}

describe('Payment expiration (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fakeClock: FakeClock;
  let fakeMp: FakeMercadoPagoClient;

  beforeAll(async () => {
    ensureTestEnv();

    fakeClock = new FakeClock(new Date(BASE_TIME));
    fakeMp = new FakeMercadoPagoClient();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CLOCK)
      .useValue(fakeClock)
      .overrideProvider(MERCADOPAGO_CLIENT)
      .useValue(fakeMp)
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

  it('marks appointment payment expired on pay attempt and surfaces in lists', async () => {
    const doctor = await registerAndLogin(app, 'doctor');
    const doctorUserId = await getUserId(app, doctor.accessToken);
    await createDoctorProfile(app, doctor.accessToken);
    await setAvailabilityRules(app, doctor.accessToken);

    const patient = await registerAndLogin(app, 'patient');
    await createPatientIdentity(app, patient.accessToken);

    const from = new Date(fakeClock.now().getTime() + 25 * 60 * 60 * 1000);
    const to = new Date(fakeClock.now().getTime() + 27 * 60 * 60 * 1000);

    const availability = await request(httpServer(app))
      .get(`/api/v1/doctors/${doctorUserId}/availability`)
      .query({ from: from.toISOString(), to: to.toISOString() })
      .expect(200);

    const startAt = availability.body.items[0]?.startAt as string;
    expect(startAt).toBeTruthy();

    const createAppointment = await request(httpServer(app))
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ doctorUserId, startAt })
      .expect(201);

    const appointmentId = createAppointment.body.appointment.id as string;
    const paymentId = createAppointment.body.payment.id as string;

    const past = new Date(fakeClock.now().getTime() - 5 * 60 * 1000);
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { paymentExpiresAt: past },
    });
    await prisma.payment.update({
      where: { id: paymentId },
      data: { expiresAt: past },
    });

    const payResponse = await request(httpServer(app))
      .post(`/api/v1/appointments/${appointmentId}/pay`)
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .expect(409);

    expect(payResponse.body.extensions?.code).toBe('payment_window_expired');

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
    });
    expect(payment?.status).toBe(PaymentStatus.expired);

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
    });
    expect(appointment?.status).toBe('cancelled');

    const dateStr = startAt.split('T')[0];
    const patientList = await request(httpServer(app))
      .get('/api/v1/patients/me/appointments')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .query({
        from: `${dateStr}T00:00:00.000Z`,
        to: `${dateStr}T23:59:59.000Z`,
        page: 1,
        limit: 10,
      })
      .expect(200);

    const listedAppointment = patientList.body.items.find(
      (item: { id: string }) => item.id === appointmentId,
    );
    expect(listedAppointment?.status).toBe('cancelled');

    fakeClock.setNow(new Date());

    const doctorPayments = await request(httpServer(app))
      .get('/api/v1/doctors/me/payments')
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .query({ range: '30d', page: 1, pageSize: 20 })
      .expect(200);

    const listedPayment = doctorPayments.body.items.find(
      (item: { id: string }) => item.id === paymentId,
    );
    expect(listedPayment?.status).toBe('expired');
  });

  it('marks emergency payment expired on pay attempt and surfaces in lists', async () => {
    const doctor = await registerAndLogin(app, 'doctor');
    const doctorUserId = await getUserId(app, doctor.accessToken);
    await createDoctorProfile(app, doctor.accessToken);

    const patient = await registerAndLogin(app, 'patient');
    await createPatientIdentity(app, patient.accessToken);

    const createQueue = await request(httpServer(app))
      .post('/api/v1/consultations/queue')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ doctorUserId, reason: 'Dolor agudo' })
      .expect(201);

    const queueItemId = createQueue.body.id as string;

    await request(httpServer(app))
      .post(`/api/v1/consultations/queue/${queueItemId}/accept`)
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .expect(201);

    const firstPayment = await request(httpServer(app))
      .post(`/api/v1/consultations/queue/${queueItemId}/payment`)
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .set('Idempotency-Key', 'idemp-queue-1')
      .expect(201);

    const paymentId = firstPayment.body.id as string;

    const past = new Date(fakeClock.now().getTime() - 5 * 60 * 1000);
    await prisma.payment.update({
      where: { id: paymentId },
      data: { expiresAt: past },
    });
    await prisma.consultationQueueItem.update({
      where: { id: queueItemId },
      data: { paymentExpiresAt: past },
    });

    const payResponse = await request(httpServer(app))
      .post(`/api/v1/consultations/queue/${queueItemId}/payment`)
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .expect(409);

    expect(payResponse.body.extensions?.code).toBe('payment_window_expired');

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
    });
    expect(payment?.status).toBe(PaymentStatus.expired);

    const queueItem = await prisma.consultationQueueItem.findUnique({
      where: { id: queueItemId },
    });
    expect(queueItem?.paymentStatus).toBe(
      ConsultationQueuePaymentStatus.expired,
    );

    const patientEmergencies = await request(httpServer(app))
      .get('/api/v1/patients/me/emergencies')
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .query({ page: 1, pageSize: 10 })
      .expect(200);

    const listedEmergency = patientEmergencies.body.items.find(
      (item: { id: string }) => item.id === queueItemId,
    );
    expect(listedEmergency?.paymentStatus).toBe('expired');

    const doctorEmergencies = await request(httpServer(app))
      .get('/api/v1/doctors/me/emergencies')
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .query({ page: 1, pageSize: 10 })
      .expect(200);

    const listedDoctorEmergency = doctorEmergencies.body.items.find(
      (item: { id: string }) => item.id === queueItemId,
    );
    expect(listedDoctorEmergency?.paymentStatus).toBe('expired');
  });
});
