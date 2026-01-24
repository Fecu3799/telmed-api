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
  role: 'patient' | 'doctor' | 'admin',
) {
  const email = `user_${randomUUID()}@test.com`;
  const password = 'Passw0rd!123';

  if (role !== 'admin') {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password, role })
      .expect(201);
  } else {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password, role: 'patient' })
      .expect(201);
  }

  if (role === 'admin') {
    const prisma = app.get(PrismaService);
    await prisma.user.update({
      where: { email },
      data: { role: 'admin' },
    });
  }

  const loginResponse = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(201);

  return {
    accessToken: loginResponse.body.accessToken as string,
    email,
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
      status: ConsultationStatus.closed,
      closedAt: new Date(),
      appointmentId: appointment.id,
    },
  });
}

describe('Patients clinical profile (e2e)', () => {
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

  const clinicalLists = [
    {
      name: 'medications',
      createPayload: { name: 'Metformin', notes: '500mg twice daily' },
      patchPayload: { notes: 'Updated instructions' },
    },
    {
      name: 'conditions',
      createPayload: { name: 'Hypertension', notes: 'Diagnosed in 2021' },
      patchPayload: { notes: 'Monitoring blood pressure' },
    },
    {
      name: 'procedures',
      createPayload: { name: 'Appendectomy', notes: 'Performed in 2018' },
      patchPayload: { notes: 'Recovered without complications' },
    },
  ];

  describe.each(clinicalLists)(
    '$name list',
    ({ name, createPayload, patchPayload }) => {
      it('patient create -> verificationStatus unverified', async () => {
        const patient = await registerAndLogin(app, 'patient');

        const createResponse = await request(app.getHttpServer())
          .post(`/api/v1/patients/me/clinical-profile/${name}`)
          .set('Authorization', `Bearer ${patient.accessToken}`)
          .send(createPayload)
          .expect(201);

        expect(createResponse.body.verificationStatus).toBe('unverified');
      });

      it('doctor verify -> verified status and audit fields', async () => {
        const doctor = await registerAndLogin(app, 'doctor');
        const patient = await registerAndLogin(app, 'patient');

        await createDoctorProfile(app, doctor.accessToken);
        await createPatientIdentity(app, patient.accessToken);

        const doctorUserId = await getUserId(app, doctor.accessToken);
        const patientUserId = await getUserId(app, patient.accessToken);

        await createConsultation(prisma, doctorUserId, patientUserId);

        const created = await request(app.getHttpServer())
          .post(`/api/v1/patients/me/clinical-profile/${name}`)
          .set('Authorization', `Bearer ${patient.accessToken}`)
          .send(createPayload)
          .expect(201);

        const verifyResponse = await request(app.getHttpServer())
          .patch(
            `/api/v1/patients/${patientUserId}/clinical-profile/${name}/${created.body.id}/verify`,
          )
          .set('Authorization', `Bearer ${doctor.accessToken}`)
          .send({ verificationStatus: 'verified' })
          .expect(200);

        expect(verifyResponse.body.verificationStatus).toBe('verified');
        expect(verifyResponse.body.verifiedByUserId).toBe(doctorUserId);
        expect(verifyResponse.body.verifiedAt).toBeTruthy();
      });

      it('patient patch after verify -> resets verification', async () => {
        const doctor = await registerAndLogin(app, 'doctor');
        const patient = await registerAndLogin(app, 'patient');

        await createDoctorProfile(app, doctor.accessToken);
        await createPatientIdentity(app, patient.accessToken);

        const doctorUserId = await getUserId(app, doctor.accessToken);
        const patientUserId = await getUserId(app, patient.accessToken);

        await createConsultation(prisma, doctorUserId, patientUserId);

        const created = await request(app.getHttpServer())
          .post(`/api/v1/patients/me/clinical-profile/${name}`)
          .set('Authorization', `Bearer ${patient.accessToken}`)
          .send(createPayload)
          .expect(201);

        await request(app.getHttpServer())
          .patch(
            `/api/v1/patients/${patientUserId}/clinical-profile/${name}/${created.body.id}/verify`,
          )
          .set('Authorization', `Bearer ${doctor.accessToken}`)
          .send({ verificationStatus: 'verified' })
          .expect(200);

        const patchResponse = await request(app.getHttpServer())
          .patch(
            `/api/v1/patients/me/clinical-profile/${name}/${created.body.id}`,
          )
          .set('Authorization', `Bearer ${patient.accessToken}`)
          .send(patchPayload)
          .expect(200);

        expect(patchResponse.body.verificationStatus).toBe('unverified');
        expect(patchResponse.body.verifiedByUserId).toBeNull();
        expect(patchResponse.body.verifiedAt).toBeNull();
      });
    },
  );

  describe('Access control', () => {
    it('doctor without consultation -> 403 on list and verify', async () => {
      const doctor = await registerAndLogin(app, 'doctor');
      const patient = await registerAndLogin(app, 'patient');

      const patientUserId = await getUserId(app, patient.accessToken);

      await request(app.getHttpServer())
        .get(`/api/v1/patients/${patientUserId}/clinical-profile/medications`)
        .set('Authorization', `Bearer ${doctor.accessToken}`)
        .expect(403);

      const created = await request(app.getHttpServer())
        .post('/api/v1/patients/me/clinical-profile/medications')
        .set('Authorization', `Bearer ${patient.accessToken}`)
        .send({ name: 'Metformin' })
        .expect(201);

      await request(app.getHttpServer())
        .patch(
          `/api/v1/patients/${patientUserId}/clinical-profile/medications/${created.body.id}/verify`,
        )
        .set('Authorization', `Bearer ${doctor.accessToken}`)
        .send({ verificationStatus: 'verified' })
        .expect(403);
    });

    it('admin -> 403', async () => {
      const admin = await registerAndLogin(app, 'admin');
      const patient = await registerAndLogin(app, 'patient');

      const patientUserId = await getUserId(app, patient.accessToken);

      await request(app.getHttpServer())
        .get(`/api/v1/patients/${patientUserId}/clinical-profile/medications`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .patch(
          `/api/v1/patients/${patientUserId}/clinical-profile/medications/${randomUUID()}/verify`,
        )
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ verificationStatus: 'verified' })
        .expect(403);
    });
  });
});
