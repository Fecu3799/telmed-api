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
import { ConsultationStatus } from '@prisma/client';
import { ensureTestEnv } from './helpers/ensure-test-env';
import { resetDb } from './helpers/reset-db';

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

  return {
    accessToken: loginResponse.body.accessToken as string,
  };
}

async function createDoctorProfile(app: INestApplication, token: string) {
  await request(app.getHttpServer())
    .put('/api/v1/doctors/me/profile')
    .set('Authorization', `Bearer ${token}`)
    .send({
      firstName: 'Dr. Test',
      lastName: 'Doctor',
      priceCents: 10000,
      currency: 'ARS',
      bio: 'Test doctor',
    })
    .expect(200);
}

async function createPatientIdentity(app: INestApplication, token: string) {
  await request(app.getHttpServer())
    .patch('/api/v1/patients/me/identity')
    .set('Authorization', `Bearer ${token}`)
    .send({
      legalFirstName: 'Test',
      legalLastName: 'Patient',
      documentType: 'DNI',
      documentNumber: randomUUID().slice(0, 8),
      documentCountry: 'AR',
      birthDate: '1990-01-01',
    })
    .expect(200);
}

async function getUserId(
  app: INestApplication,
  token: string,
): Promise<string> {
  const me = await request(app.getHttpServer())
    .get('/api/v1/auth/me')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  return me.body.id as string;
}

async function createConsultation(
  prisma: PrismaService,
  doctorUserId: string,
  patientUserId: string,
) {
  const patient = await prisma.patient.findUniqueOrThrow({
    where: { userId: patientUserId },
    select: { id: true },
  });

  const appointment = await prisma.appointment.create({
    data: {
      doctorUserId,
      patientId: patient.id,
      startAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      endAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
      status: 'confirmed',
    },
  });

  return prisma.consultation.create({
    data: {
      doctorUserId,
      patientUserId,
      status: ConsultationStatus.draft,
      appointmentId: appointment.id,
    },
  });
}

describe('Clinical episode draft (e2e)', () => {
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

  it('doctor upsert draft creates and updates same draft', async () => {
    const doctor = await registerAndLogin(app, 'doctor');
    const patient = await registerAndLogin(app, 'patient');

    await createDoctorProfile(app, doctor.accessToken);
    await createPatientIdentity(app, patient.accessToken);

    const doctorUserId = await getUserId(app, doctor.accessToken);
    const patientUserId = await getUserId(app, patient.accessToken);

    const consultation = await createConsultation(
      prisma,
      doctorUserId,
      patientUserId,
    );

    const first = await request(app.getHttpServer())
      .put(
        `/api/v1/consultations/${consultation.id}/clinical-episode/draft`,
      )
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .send({ title: 'Draft A', body: 'Initial draft' })
      .expect(200);

    const second = await request(app.getHttpServer())
      .put(
        `/api/v1/consultations/${consultation.id}/clinical-episode/draft`,
      )
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .send({ title: 'Draft B', body: 'Updated draft' })
      .expect(200);

    expect(first.body.draft.id).toBeDefined();
    expect(second.body.draft.id).toBe(first.body.draft.id);
    expect(second.body.draft.title).toBe('Draft B');
    expect(second.body.draft.body).toBe('Updated draft');
  });

  it('doctor can read draft', async () => {
    const doctor = await registerAndLogin(app, 'doctor');
    const patient = await registerAndLogin(app, 'patient');

    await createDoctorProfile(app, doctor.accessToken);
    await createPatientIdentity(app, patient.accessToken);

    const doctorUserId = await getUserId(app, doctor.accessToken);
    const patientUserId = await getUserId(app, patient.accessToken);

    const consultation = await createConsultation(
      prisma,
      doctorUserId,
      patientUserId,
    );

    await request(app.getHttpServer())
      .put(
        `/api/v1/consultations/${consultation.id}/clinical-episode/draft`,
      )
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .send({ title: 'Draft A', body: 'Initial draft' })
      .expect(200);

    const getResponse = await request(app.getHttpServer())
      .get(`/api/v1/consultations/${consultation.id}/clinical-episode`)
      .set('Authorization', `Bearer ${doctor.accessToken}`)
      .expect(200);

    expect(getResponse.body.draft.title).toBe('Draft A');
  });

  it('patient cannot see draft (404) and cannot write (403)', async () => {
    const doctor = await registerAndLogin(app, 'doctor');
    const patient = await registerAndLogin(app, 'patient');

    await createDoctorProfile(app, doctor.accessToken);
    await createPatientIdentity(app, patient.accessToken);

    const doctorUserId = await getUserId(app, doctor.accessToken);
    const patientUserId = await getUserId(app, patient.accessToken);

    const consultation = await createConsultation(
      prisma,
      doctorUserId,
      patientUserId,
    );

    await request(app.getHttpServer())
      .get(`/api/v1/consultations/${consultation.id}/clinical-episode`)
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .put(
        `/api/v1/consultations/${consultation.id}/clinical-episode/draft`,
      )
      .set('Authorization', `Bearer ${patient.accessToken}`)
      .send({ title: 'Draft A', body: 'Initial draft' })
      .expect(403);
  });

  it('doctor not owner cannot read or write', async () => {
    const doctor = await registerAndLogin(app, 'doctor');
    const otherDoctor = await registerAndLogin(app, 'doctor');
    const patient = await registerAndLogin(app, 'patient');

    await createDoctorProfile(app, doctor.accessToken);
    await createDoctorProfile(app, otherDoctor.accessToken);
    await createPatientIdentity(app, patient.accessToken);

    const doctorUserId = await getUserId(app, doctor.accessToken);
    const otherDoctorUserId = await getUserId(app, otherDoctor.accessToken);
    const patientUserId = await getUserId(app, patient.accessToken);

    const consultation = await createConsultation(
      prisma,
      doctorUserId,
      patientUserId,
    );

    await request(app.getHttpServer())
      .put(
        `/api/v1/consultations/${consultation.id}/clinical-episode/draft`,
      )
      .set('Authorization', `Bearer ${otherDoctor.accessToken}`)
      .send({ title: 'Draft A', body: 'Initial draft' })
      .expect(403);

    await request(app.getHttpServer())
      .get(`/api/v1/consultations/${consultation.id}/clinical-episode`)
      .set('Authorization', `Bearer ${otherDoctor.accessToken}`)
      .expect(403);
  });
});
