import {
  HttpStatus,
  UnprocessableEntityException,
  ValidationPipe,
} from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { mapValidationErrors } from '../src/common/utils/validation-errors';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { resetDb } from './helpers/reset-db';
import { ensureTestEnv } from './helpers/ensure-test-env';
import {
  ConsultationStatus,
  PatientFileStatus,
  PatientFileCategory,
} from '@prisma/client';

function httpServer(app: INestApplication): Server {
  return app.getHttpServer() as unknown as Server;
}

async function registerAndLogin(
  app: INestApplication,
  role: 'patient' | 'doctor' | 'admin',
) {
  const email = `user_${randomUUID()}@test.com`;
  const password = 'Passw0rd!123';
  let accessToken: string | undefined;

  if (role !== 'admin') {
    const registerResponse = await request(httpServer(app))
      .post('/api/v1/auth/register')
      .send({ email, password, role })
      .expect(201);
    accessToken = registerResponse.body.accessToken as string;
  } else {
    const registerResponse = await request(httpServer(app))
      .post('/api/v1/auth/register')
      .send({ email, password, role: 'patient' })
      .expect(201);
    accessToken = registerResponse.body.accessToken as string;
  }

  if (role === 'admin') {
    const prisma = app.get(PrismaService);
    await prisma.user.update({
      where: { email },
      data: { role: 'admin' },
    });
  }

  if (role === 'admin') {
    const loginResponse = await request(httpServer(app))
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(201);
    accessToken = loginResponse.body.accessToken as string;
  }

  return {
    accessToken: accessToken,
    email,
  };
}

async function createDoctorProfile(app: INestApplication, token: string) {
  await request(httpServer(app))
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
  await request(httpServer(app))
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
  const me = await request(httpServer(app))
    .get('/api/v1/auth/me')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  return me.body.id as string;
}

/**
 * Create a consultation between doctor and patient
 */
async function createConsultation(
  prisma: PrismaService,
  doctorUserId: string,
  patientUserId: string,
  status: ConsultationStatus = ConsultationStatus.closed,
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
      status,
      appointmentId: appointment.id,
      startedAt: status === ConsultationStatus.in_progress ? new Date() : null,
      closedAt: status === ConsultationStatus.closed ? new Date() : null,
    },
  });
}

describe('Patient Files (e2e)', () => {
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

  describe('Patient self access', () => {
    it('patient can prepare, upload, confirm, list and download file', async () => {
      const patient = await registerAndLogin(app, 'patient');
      await createPatientIdentity(app, patient.accessToken);

      const sha256 =
        'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9';

      // 1. Prepare upload
      const prepareResponse = await request(httpServer(app))
        .post('/api/v1/patients/me/files/prepare')
        .set('Authorization', `Bearer ${patient.accessToken}`)
        .send({
          originalName: 'test.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          category: PatientFileCategory.lab,
          sha256,
        })
        .expect(201);

      expect(prepareResponse.body.patientFileId).toBeDefined();
      expect(prepareResponse.body.fileObjectId).toBeDefined();
      expect(prepareResponse.body.uploadUrl).toBeDefined();
      expect(prepareResponse.body.expiresAt).toBeDefined();

      const { patientFileId, fileObjectId } = prepareResponse.body;

      // 2. Simulate upload (in real scenario, client uploads to uploadUrl)
      // For testing, we just verify the fileObject was created

      // 3. Confirm upload
      const confirmResponse = await request(httpServer(app))
        .post(`/api/v1/patients/me/files/${patientFileId}/confirm`)
        .set('Authorization', `Bearer ${patient.accessToken}`)
        .send({
          fileObjectId,
          sha256,
        })
        .expect(201);

      expect(confirmResponse.body.patientFileId).toBe(patientFileId);

      // Verify status is ready
      const fileObject = await prisma.fileObject.findUnique({
        where: { id: fileObjectId },
      });
      expect(fileObject).toBeDefined();

      const patientFile = await prisma.patientFile.findUnique({
        where: { id: patientFileId },
      });
      expect(patientFile?.status).toBe(PatientFileStatus.ready);

      // 4. List files
      const listResponse = await request(httpServer(app))
        .get('/api/v1/patients/me/files')
        .set('Authorization', `Bearer ${patient.accessToken}`)
        .expect(200);

      expect(listResponse.body.items).toHaveLength(1);
      expect(listResponse.body.items[0].id).toBe(patientFileId);
      expect(listResponse.body.items[0].status).toBe('ready');
      expect(listResponse.body.items[0].originalName).toBe('test.pdf');
      expect(listResponse.body.items[0].category).toBe('lab');

      // 5. Get file metadata
      const getResponse = await request(httpServer(app))
        .get(`/api/v1/patients/me/files/${patientFileId}`)
        .set('Authorization', `Bearer ${patient.accessToken}`)
        .expect(200);

      expect(getResponse.body.id).toBe(patientFileId);
      expect(getResponse.body.status).toBe('ready');

      // 6. Get download URL
      const downloadResponse = await request(httpServer(app))
        .get(`/api/v1/patients/me/files/${patientFileId}/download`)
        .set('Authorization', `Bearer ${patient.accessToken}`)
        .expect(200);

      expect(downloadResponse.body.downloadUrl).toBeDefined();
      expect(downloadResponse.body.expiresAt).toBeDefined();
    });

    it('patient can delete file (soft delete)', async () => {
      const patient = await registerAndLogin(app, 'patient');
      await createPatientIdentity(app, patient.accessToken);

      const prepareResponse = await request(httpServer(app))
        .post('/api/v1/patients/me/files/prepare')
        .set('Authorization', `Bearer ${patient.accessToken}`)
        .send({
          originalName: 'test.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
        })
        .expect(201);

      const { patientFileId, fileObjectId } = prepareResponse.body;

      await request(httpServer(app))
        .post(`/api/v1/patients/me/files/${patientFileId}/confirm`)
        .set('Authorization', `Bearer ${patient.accessToken}`)
        .send({ fileObjectId })
        .expect(201);

      // Delete
      await request(httpServer(app))
        .delete(`/api/v1/patients/me/files/${patientFileId}`)
        .set('Authorization', `Bearer ${patient.accessToken}`)
        .expect(200);

      // Verify status is deleted
      const patientFile = await prisma.patientFile.findUnique({
        where: { id: patientFileId },
      });
      expect(patientFile?.status).toBe(PatientFileStatus.deleted);

      // File should not appear in list (default status filter is 'ready')
      const listResponse = await request(httpServer(app))
        .get('/api/v1/patients/me/files')
        .set('Authorization', `Bearer ${patient.accessToken}`)
        .expect(200);

      expect(listResponse.body.items).toHaveLength(0);
    });
  });

  describe('Doctor access', () => {
    it('doctor can access files of patient they consulted with', async () => {
      const doctor = await registerAndLogin(app, 'doctor');
      const patient = await registerAndLogin(app, 'patient');

      await createDoctorProfile(app, doctor.accessToken);
      await createPatientIdentity(app, patient.accessToken);

      const doctorUserId = await getUserId(app, doctor.accessToken);
      const patientUserId = await getUserId(app, patient.accessToken);

      // Create consultation
      await createConsultation(
        prisma,
        doctorUserId,
        patientUserId,
        ConsultationStatus.closed,
      );

      // Patient uploads a file
      const prepareResponse = await request(httpServer(app))
        .post('/api/v1/patients/me/files/prepare')
        .set('Authorization', `Bearer ${patient.accessToken}`)
        .send({
          originalName: 'patient_file.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 2048,
        })
        .expect(201);

      const { patientFileId, fileObjectId } = prepareResponse.body;

      await request(httpServer(app))
        .post(`/api/v1/patients/me/files/${patientFileId}/confirm`)
        .set('Authorization', `Bearer ${patient.accessToken}`)
        .send({ fileObjectId })
        .expect(201);

      // Doctor can list patient files
      const listResponse = await request(httpServer(app))
        .get(`/api/v1/patients/${patientUserId}/files`)
        .set('Authorization', `Bearer ${doctor.accessToken}`)
        .expect(200);

      expect(listResponse.body.items).toHaveLength(1);
      expect(listResponse.body.items[0].id).toBe(patientFileId);

      // Doctor can get file metadata
      await request(httpServer(app))
        .get(`/api/v1/patients/${patientUserId}/files/${patientFileId}`)
        .set('Authorization', `Bearer ${doctor.accessToken}`)
        .expect(200);

      // Doctor can download
      const downloadResponse = await request(httpServer(app))
        .get(
          `/api/v1/patients/${patientUserId}/files/${patientFileId}/download`,
        )
        .set('Authorization', `Bearer ${doctor.accessToken}`)
        .expect(200);

      expect(downloadResponse.body.downloadUrl).toBeDefined();

      // Doctor can upload file for patient
      const doctorPrepareResponse = await request(httpServer(app))
        .post(`/api/v1/patients/${patientUserId}/files/prepare`)
        .set('Authorization', `Bearer ${doctor.accessToken}`)
        .send({
          originalName: 'doctor_file.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          category: PatientFileCategory.image,
        })
        .expect(201);

      const doctorFileId = doctorPrepareResponse.body.patientFileId;
      const doctorFileObjectId = doctorPrepareResponse.body.fileObjectId;

      await request(httpServer(app))
        .post(`/api/v1/patients/${patientUserId}/files/${doctorFileId}/confirm`)
        .set('Authorization', `Bearer ${doctor.accessToken}`)
        .send({ fileObjectId: doctorFileObjectId })
        .expect(201);

      // Verify both files are listed
      const finalListResponse = await request(httpServer(app))
        .get(`/api/v1/patients/${patientUserId}/files`)
        .set('Authorization', `Bearer ${doctor.accessToken}`)
        .expect(200);

      expect(finalListResponse.body.items).toHaveLength(2);
    });

    it('doctor cannot access files of patient without consultation', async () => {
      const doctor = await registerAndLogin(app, 'doctor');
      const patient = await registerAndLogin(app, 'patient');

      await createDoctorProfile(app, doctor.accessToken);
      await createPatientIdentity(app, patient.accessToken);

      const patientUserId = await getUserId(app, patient.accessToken);

      // Try to access files without consultation
      await request(httpServer(app))
        .get(`/api/v1/patients/${patientUserId}/files`)
        .set('Authorization', `Bearer ${doctor.accessToken}`)
        .expect(403);
    });
  });

  describe('Access control', () => {
    it('admin cannot access patient files', async () => {
      const admin = await registerAndLogin(app, 'admin');
      const patient = await registerAndLogin(app, 'patient');

      await createPatientIdentity(app, patient.accessToken);
      const patientUserId = await getUserId(app, patient.accessToken);

      await request(httpServer(app))
        .get(`/api/v1/patients/${patientUserId}/files`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(403);

      await request(httpServer(app))
        .post(`/api/v1/patients/${patientUserId}/files/prepare`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({
          originalName: 'test.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
        })
        .expect(403);
    });

    it('patient cannot access other patient files', async () => {
      const patient1 = await registerAndLogin(app, 'patient');
      const patient2 = await registerAndLogin(app, 'patient');

      await createPatientIdentity(app, patient1.accessToken);
      await createPatientIdentity(app, patient2.accessToken);

      const patient2UserId = await getUserId(app, patient2.accessToken);

      await request(httpServer(app))
        .get(`/api/v1/patients/${patient2UserId}/files`)
        .set('Authorization', `Bearer ${patient1.accessToken}`)
        .expect(403);
    });
  });

  describe('Validation and errors', () => {
    it('rejects invalid MIME type', async () => {
      const patient = await registerAndLogin(app, 'patient');
      await createPatientIdentity(app, patient.accessToken);

      await request(httpServer(app))
        .post('/api/v1/patients/me/files/prepare')
        .set('Authorization', `Bearer ${patient.accessToken}`)
        .send({
          originalName: 'test.exe',
          mimeType: 'application/x-executable',
          sizeBytes: 1024,
        })
        .expect(422);
    });

    it('rejects file size exceeding limit for patient', async () => {
      const patient = await registerAndLogin(app, 'patient');
      await createPatientIdentity(app, patient.accessToken);

      await request(httpServer(app))
        .post('/api/v1/patients/me/files/prepare')
        .set('Authorization', `Bearer ${patient.accessToken}`)
        .send({
          originalName: 'huge.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 21 * 1024 * 1024, // 21MB (exceeds 20MB default limit)
        })
        .expect(422);
    });

    it('rejects invalid SHA-256 format', async () => {
      const patient = await registerAndLogin(app, 'patient');
      await createPatientIdentity(app, patient.accessToken);

      await request(httpServer(app))
        .post('/api/v1/patients/me/files/prepare')
        .set('Authorization', `Bearer ${patient.accessToken}`)
        .send({
          originalName: 'test.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          sha256: 'invalid-hash',
        })
        .expect(422);
    });

    it('rejects SHA-256 mismatch on confirm', async () => {
      const patient = await registerAndLogin(app, 'patient');
      await createPatientIdentity(app, patient.accessToken);

      const sha256 =
        'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9';
      const wrongSha256 =
        'a94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9';

      const prepareResponse = await request(httpServer(app))
        .post('/api/v1/patients/me/files/prepare')
        .set('Authorization', `Bearer ${patient.accessToken}`)
        .send({
          originalName: 'test.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          sha256,
        })
        .expect(201);

      const { patientFileId, fileObjectId } = prepareResponse.body;

      // Confirm with wrong SHA-256
      await request(httpServer(app))
        .post(`/api/v1/patients/me/files/${patientFileId}/confirm`)
        .set('Authorization', `Bearer ${patient.accessToken}`)
        .send({
          fileObjectId,
          sha256: wrongSha256,
        })
        .expect(409);
    });

    it('rejects confirm with wrong fileObjectId', async () => {
      const patient = await registerAndLogin(app, 'patient');
      await createPatientIdentity(app, patient.accessToken);

      const prepareResponse = await request(httpServer(app))
        .post('/api/v1/patients/me/files/prepare')
        .set('Authorization', `Bearer ${patient.accessToken}`)
        .send({
          originalName: 'test.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
        })
        .expect(201);

      const { patientFileId } = prepareResponse.body;
      const wrongFileObjectId = randomUUID();

      await request(httpServer(app))
        .post(`/api/v1/patients/me/files/${patientFileId}/confirm`)
        .set('Authorization', `Bearer ${patient.accessToken}`)
        .send({
          fileObjectId: wrongFileObjectId,
        })
        .expect(409);
    });

    it('rejects download when file is not ready', async () => {
      const patient = await registerAndLogin(app, 'patient');
      await createPatientIdentity(app, patient.accessToken);

      const prepareResponse = await request(httpServer(app))
        .post('/api/v1/patients/me/files/prepare')
        .set('Authorization', `Bearer ${patient.accessToken}`)
        .send({
          originalName: 'test.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
        })
        .expect(201);

      const { patientFileId } = prepareResponse.body;

      // Try to download before confirm
      await request(httpServer(app))
        .get(`/api/v1/patients/me/files/${patientFileId}/download`)
        .set('Authorization', `Bearer ${patient.accessToken}`)
        .expect(404);
    });
  });

  describe('Audit logging', () => {
    it('creates audit logs for file operations', async () => {
      const patient = await registerAndLogin(app, 'patient');
      await createPatientIdentity(app, patient.accessToken);

      const traceId = 'trace-patient-files-test';

      // Prepare
      const prepareResponse = await request(httpServer(app))
        .post('/api/v1/patients/me/files/prepare')
        .set('Authorization', `Bearer ${patient.accessToken}`)
        .set('X-Trace-Id', traceId)
        .send({
          originalName: 'test.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
        })
        .expect(201);

      const { patientFileId, fileObjectId } = prepareResponse.body;

      // Confirm
      await request(httpServer(app))
        .post(`/api/v1/patients/me/files/${patientFileId}/confirm`)
        .set('Authorization', `Bearer ${patient.accessToken}`)
        .set('X-Trace-Id', traceId)
        .send({ fileObjectId })
        .expect(201);

      // List
      await request(httpServer(app))
        .get('/api/v1/patients/me/files')
        .set('Authorization', `Bearer ${patient.accessToken}`)
        .set('X-Trace-Id', traceId)
        .expect(200);

      // Download
      await request(httpServer(app))
        .get(`/api/v1/patients/me/files/${patientFileId}/download`)
        .set('Authorization', `Bearer ${patient.accessToken}`)
        .set('X-Trace-Id', traceId)
        .expect(200);

      // Delete
      await request(httpServer(app))
        .delete(`/api/v1/patients/me/files/${patientFileId}`)
        .set('Authorization', `Bearer ${patient.accessToken}`)
        .set('X-Trace-Id', traceId)
        .expect(200);

      // Count audit logs
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          resourceType: 'PatientFile',
          resourceId: patientFileId,
        },
      });

      expect(auditLogs.length).toBeGreaterThanOrEqual(4); // prepare, confirm, download, delete

      const actions = auditLogs.map((log) => log.action);
      expect(actions).toContain('WRITE'); // prepare, confirm, delete
      expect(actions).toContain('READ'); // download

      // Verify traceId is logged
      const downloadLog = auditLogs.find(
        (log) =>
          log.action === 'READ' &&
          log.metadata &&
          typeof log.metadata === 'object' &&
          (log.metadata as any).event === 'download_requested',
      );
      expect(downloadLog?.traceId).toBe(traceId);
    });
  });

  describe('File listing filters', () => {
    it('filters files by category and consultation', async () => {
      const patient = await registerAndLogin(app, 'patient');
      const doctor = await registerAndLogin(app, 'doctor');

      await createPatientIdentity(app, patient.accessToken);
      await createDoctorProfile(app, doctor.accessToken);

      const doctorUserId = await getUserId(app, doctor.accessToken);
      const patientUserId = await getUserId(app, patient.accessToken);

      // Create consultation
      const consultation = await createConsultation(
        prisma,
        doctorUserId,
        patientUserId,
        ConsultationStatus.closed,
      );

      // Upload files with different categories
      const labFile = await request(httpServer(app))
        .post('/api/v1/patients/me/files/prepare')
        .set('Authorization', `Bearer ${patient.accessToken}`)
        .send({
          originalName: 'lab.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          category: PatientFileCategory.lab,
          relatedConsultationId: consultation.id,
        })
        .expect(201);

      await request(httpServer(app))
        .post(`/api/v1/patients/me/files/${labFile.body.patientFileId}/confirm`)
        .set('Authorization', `Bearer ${patient.accessToken}`)
        .send({ fileObjectId: labFile.body.fileObjectId })
        .expect(201);

      const imageFile = await request(httpServer(app))
        .post('/api/v1/patients/me/files/prepare')
        .set('Authorization', `Bearer ${patient.accessToken}`)
        .send({
          originalName: 'image.png',
          mimeType: 'image/png',
          sizeBytes: 2048,
          category: PatientFileCategory.image,
        })
        .expect(201);

      await request(httpServer(app))
        .post(
          `/api/v1/patients/me/files/${imageFile.body.patientFileId}/confirm`,
        )
        .set('Authorization', `Bearer ${patient.accessToken}`)
        .send({ fileObjectId: imageFile.body.fileObjectId })
        .expect(201);

      // Filter by category
      const labFilesResponse = await request(httpServer(app))
        .get('/api/v1/patients/me/files')
        .set('Authorization', `Bearer ${patient.accessToken}`)
        .query({ category: PatientFileCategory.lab })
        .expect(200);

      expect(labFilesResponse.body.items).toHaveLength(1);
      expect(labFilesResponse.body.items[0].category).toBe('lab');

      // Filter by consultation
      const consultationFilesResponse = await request(httpServer(app))
        .get('/api/v1/patients/me/files')
        .set('Authorization', `Bearer ${patient.accessToken}`)
        .query({ relatedConsultationId: consultation.id })
        .expect(200);

      expect(consultationFilesResponse.body.items).toHaveLength(1);
      expect(
        consultationFilesResponse.body.items[0].relatedConsultationId,
      ).toBe(consultation.id);

      // Search by name
      const searchResponse = await request(httpServer(app))
        .get('/api/v1/patients/me/files')
        .set('Authorization', `Bearer ${patient.accessToken}`)
        .query({ q: 'lab' })
        .expect(200);

      expect(searchResponse.body.items).toHaveLength(1);
      expect(searchResponse.body.items[0].originalName).toContain('lab');
    });
  });
});
