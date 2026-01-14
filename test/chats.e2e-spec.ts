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
import { io, Socket } from 'socket.io-client';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { mapValidationErrors } from '../src/common/utils/validation-errors';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { resetDb } from './helpers/reset-db';
import { ensureTestEnv } from './helpers/ensure-test-env';
import { CLOCK } from '../src/common/clock/clock';
import { FakeClock } from './utils/fake-clock';
import { AppointmentStatus, ConsultationStatus } from '@prisma/client';

function httpServer(app: INestApplication): Server {
  return app.getHttpServer() as unknown as Server;
}

async function registerAndLogin(
  app: INestApplication,
  role: 'patient' | 'doctor' | 'admin',
) {
  const email = `user_${randomUUID()}@test.com`;
  const password = 'Passw0rd!123';

  if (role !== 'admin') {
    await request(httpServer(app))
      .post('/api/v1/auth/register')
      .send({ email, password, role })
      .expect(201);
  } else {
    await request(httpServer(app))
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

  const loginResponse = await request(httpServer(app))
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(201);

  return {
    accessToken: loginResponse.body.accessToken as string,
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
 * Connect to /chats namespace WebSocket
 * Supports auth via auth.token (browser) or extraHeaders.Authorization (Node)
 */
async function connectChatSocket(
  baseUrl: string,
  token: string,
): Promise<Socket> {
  return new Promise<Socket>((resolve, reject) => {
    const socket = io(`${baseUrl}/chats`, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
    });

    const timeout = setTimeout(() => {
      socket.disconnect();
      reject(new Error('Socket connection timeout'));
    }, 5000);

    socket.on('connect', () => {
      clearTimeout(timeout);
      resolve(socket);
    });

    socket.on('connect_error', (error) => {
      clearTimeout(timeout);
      socket.disconnect();
      reject(error);
    });
  });
}

/**
 * Emit event with ACK and timeout
 * Throws error with code in message for error responses
 */
async function emitAck<T>(
  socket: Socket,
  event: string,
  payload: unknown,
  timeoutMs = 2000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout waiting for ACK on ${event}`));
    }, timeoutMs);

    socket.emit(event, payload, (response: any) => {
      clearTimeout(timeout);
      if (response?.ok) {
        resolve(response.data ?? response);
      } else {
        const errorCode = response?.error?.code ?? 'UNKNOWN_ERROR';
        const errorMessage = response?.error?.message ?? 'Unknown error';
        // Include code in message for easier assertion
        const error = new Error(`${errorCode}: ${errorMessage}`);
        (error as any).code = errorCode;
        reject(error);
      }
    });
  });
}

/**
 * Wait for event with optional predicate and timeout
 */
async function waitForEvent<T>(
  socket: Socket,
  event: string,
  predicate?: (payload: T) => boolean,
  timeoutMs = 2000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timeout waiting for event ${event}`));
    }, timeoutMs);

    const handler = (payload: T) => {
      if (!predicate || predicate(payload)) {
        clearTimeout(timeout);
        socket.off(event, handler);
        resolve(payload);
      }
    };

    socket.on(event, handler);
  });
}

/**
 * Create or get thread between doctor and patient
 * Returns threadId
 */
async function getOrCreateThread(
  app: INestApplication,
  doctorToken: string,
  patientUserId: string,
): Promise<string> {
  const response = await request(httpServer(app))
    .get(`/api/v1/chats/threads/with/${patientUserId}`)
    .set('Authorization', `Bearer ${doctorToken}`)
    .expect(200);

  return response.body.id as string;
}

/**
 * Update thread policy (doctor only)
 */
async function updateThreadPolicy(
  app: INestApplication,
  doctorToken: string,
  threadId: string,
  updates: {
    patientCanMessage?: boolean;
    dailyLimit?: number;
    burstLimit?: number;
    burstWindowSeconds?: number;
    requireRecentConsultation?: boolean;
    recentConsultationWindowHours?: number;
    closedByDoctor?: boolean;
  },
) {
  await request(httpServer(app))
    .patch(`/api/v1/chats/threads/${threadId}/policy`)
    .set('Authorization', `Bearer ${doctorToken}`)
    .send(updates)
    .expect(200);
}

/**
 * Create a closed consultation for testing policy requirements
 */
async function createClosedConsultation(
  prisma: PrismaService,
  doctorUserId: string,
  patientUserId: string,
  closedAt: Date,
) {
  // Get patientId from patientUserId
  const patient = await prisma.patient.findUniqueOrThrow({
    where: { userId: patientUserId },
  });

  // Create appointment first (required for consultation constraint)
  const startAt = new Date(closedAt.getTime() - 60 * 60 * 1000); // 1 hour before
  const endAt = closedAt;
  const appointment = await prisma.appointment.create({
    data: {
      doctorUserId,
      patientId: patient.id,
      startAt,
      endAt,
      status: AppointmentStatus.scheduled,
    },
  });

  // Create consultation with appointmentId
  return prisma.consultation.create({
    data: {
      appointmentId: appointment.id,
      doctorUserId,
      patientUserId,
      status: ConsultationStatus.closed,
      startedAt: startAt,
      closedAt,
    },
  });
}

/**
 * Create an in-progress consultation for testing context
 */
async function createInProgressConsultation(
  prisma: PrismaService,
  doctorUserId: string,
  patientUserId: string,
) {
  // Get patientId from patientUserId
  const patient = await prisma.patient.findUniqueOrThrow({
    where: { userId: patientUserId },
  });

  // Create appointment first (required for consultation constraint)
  const startAt = new Date();
  const endAt = new Date(startAt.getTime() + 60 * 60 * 1000); // 1 hour later
  const appointment = await prisma.appointment.create({
    data: {
      doctorUserId,
      patientId: patient.id,
      startAt,
      endAt,
      status: AppointmentStatus.scheduled,
    },
  });

  // Create consultation with appointmentId
  return prisma.consultation.create({
    data: {
      appointmentId: appointment.id,
      doctorUserId,
      patientUserId,
      status: ConsultationStatus.in_progress,
      startedAt: startAt,
    },
  });
}

describe('Chats (e2e)', () => {
  jest.setTimeout(30000); // WebSocket tests need more time

  let app: INestApplication<App>;
  let prisma: PrismaService;
  let baseUrl: string;
  let fakeClock: FakeClock;

  beforeAll(async () => {
    ensureTestEnv();

    fakeClock = new FakeClock(new Date());

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
    await app.listen(0);
    prisma = app.get(PrismaService);

    const address = httpServer(app).address();
    const port = typeof address === 'string' ? 3000 : (address?.port ?? 3000);
    baseUrl = `http://127.0.0.1:${port}`;
  });

  beforeEach(async () => {
    await resetDb(prisma);
    fakeClock.setNow(new Date());
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // A) Conexión/Auth
  describe('Connection/Auth', () => {
    it('UNAUTHORIZED: operations fail without token', async () => {
      // Socket.IO allows connection, but operations fail without auth
      const socket = await connectChatSocket(baseUrl, '');

      // Any operation should fail
      await expect(
        emitAck(socket, 'chat:join', { threadId: randomUUID() }),
      ).rejects.toThrow(/UNAUTHORIZED/);

      socket.disconnect();
    });

    it('UNAUTHORIZED: operations fail with invalid token', async () => {
      // Socket.IO allows connection, but operations fail with invalid auth
      const socket = await connectChatSocket(baseUrl, 'invalid_token');

      // Any operation should fail
      await expect(
        emitAck(socket, 'chat:join', { threadId: randomUUID() }),
      ).rejects.toThrow(/UNAUTHORIZED/);

      socket.disconnect();
    });

    it('connects OK with valid token (doctor)', async () => {
      const doctor = await registerAndLogin(app, 'doctor');
      const socket = await connectChatSocket(baseUrl, doctor.accessToken);
      expect(socket.connected).toBe(true);
      socket.disconnect();
    });

    it('connects OK with valid token (patient)', async () => {
      const patient = await registerAndLogin(app, 'patient');
      const socket = await connectChatSocket(baseUrl, patient.accessToken);
      expect(socket.connected).toBe(true);
      socket.disconnect();
    });
  });

  // B) chat:join
  describe('chat:join', () => {
    it('OK: doctor joins thread', async () => {
      const doctor = await registerAndLogin(app, 'doctor');
      const patient = await registerAndLogin(app, 'patient');
      await createDoctorProfile(app, doctor.accessToken);
      await createPatientIdentity(app, patient.accessToken);

      const patientUserId = await getUserId(app, patient.accessToken);
      const threadId = await getOrCreateThread(
        app,
        doctor.accessToken,
        patientUserId,
      );

      const socket = await connectChatSocket(baseUrl, doctor.accessToken);
      const ack = await emitAck<{ threadId: string }>(socket, 'chat:join', {
        threadId,
      });

      expect(ack.threadId).toBe(threadId);
      socket.disconnect();
    });

    it('OK: patient joins thread', async () => {
      const doctor = await registerAndLogin(app, 'doctor');
      const patient = await registerAndLogin(app, 'patient');
      await createDoctorProfile(app, doctor.accessToken);
      await createPatientIdentity(app, patient.accessToken);

      const patientUserId = await getUserId(app, patient.accessToken);
      const threadId = await getOrCreateThread(
        app,
        doctor.accessToken,
        patientUserId,
      );

      const socket = await connectChatSocket(baseUrl, patient.accessToken);
      const ack = await emitAck<{ threadId: string }>(socket, 'chat:join', {
        threadId,
      });

      expect(ack.threadId).toBe(threadId);
      socket.disconnect();
    });

    it('NOT_FOUND: join with random threadId', async () => {
      const doctor = await registerAndLogin(app, 'doctor');
      const socket = await connectChatSocket(baseUrl, doctor.accessToken);

      await expect(
        emitAck(socket, 'chat:join', { threadId: randomUUID() }),
      ).rejects.toThrow(/NOT_FOUND/);

      socket.disconnect();
    });

    it('FORBIDDEN: outsider joins thread', async () => {
      const doctor = await registerAndLogin(app, 'doctor');
      const patient = await registerAndLogin(app, 'patient');
      const outsider = await registerAndLogin(app, 'patient');
      await createDoctorProfile(app, doctor.accessToken);
      await createPatientIdentity(app, patient.accessToken);
      await createPatientIdentity(app, outsider.accessToken);

      const patientUserId = await getUserId(app, patient.accessToken);
      const threadId = await getOrCreateThread(
        app,
        doctor.accessToken,
        patientUserId,
      );

      const socket = await connectChatSocket(baseUrl, outsider.accessToken);

      await expect(
        emitAck(socket, 'chat:join', { threadId }),
      ).rejects.toThrow();

      socket.disconnect();
    });
  });

  // C) chat:send happy path
  describe('chat:send - happy path', () => {
    it('doctor sends message and both receive broadcast', async () => {
      const doctor = await registerAndLogin(app, 'doctor');
      const patient = await registerAndLogin(app, 'patient');
      await createDoctorProfile(app, doctor.accessToken);
      await createPatientIdentity(app, patient.accessToken);

      const patientUserId = await getUserId(app, patient.accessToken);
      const threadId = await getOrCreateThread(
        app,
        doctor.accessToken,
        patientUserId,
      );

      const doctorSocket = await connectChatSocket(baseUrl, doctor.accessToken);
      const patientSocket = await connectChatSocket(
        baseUrl,
        patient.accessToken,
      );

      await emitAck(doctorSocket, 'chat:join', { threadId });
      await emitAck(patientSocket, 'chat:join', { threadId });

      const clientMessageId = randomUUID();
      const messageText = 'Hola desde doctor';

      // Set up listeners BEFORE sending
      const doctorReceived = waitForEvent<{ message: any }>(
        doctorSocket,
        'chat:message',
      );
      const patientReceived = waitForEvent<{ message: any }>(
        patientSocket,
        'chat:message',
      );

      const ack = await emitAck<{ message: any }>(doctorSocket, 'chat:send', {
        threadId,
        clientMessageId,
        kind: 'text',
        text: messageText,
      });

      expect(ack.message.id).toBeDefined();
      expect(ack.message.text).toBe(messageText);
      expect(ack.message.senderRole).toBe('doctor');

      // Both should receive the broadcast
      const doctorEvent = await doctorReceived;
      const patientEvent = await patientReceived;

      expect(doctorEvent.message.id).toBe(ack.message.id);
      expect(doctorEvent.message.text).toBe(messageText);
      expect(patientEvent.message.id).toBe(ack.message.id);
      expect(patientEvent.message.text).toBe(messageText);

      doctorSocket.disconnect();
      patientSocket.disconnect();
    });

    it('patient sends message with valid policy', async () => {
      const doctor = await registerAndLogin(app, 'doctor');
      const patient = await registerAndLogin(app, 'patient');
      await createDoctorProfile(app, doctor.accessToken);
      await createPatientIdentity(app, patient.accessToken);

      const doctorUserId = await getUserId(app, doctor.accessToken);
      const patientUserId = await getUserId(app, patient.accessToken);
      const threadId = await getOrCreateThread(
        app,
        doctor.accessToken,
        patientUserId,
      );

      // Create recent closed consultation to satisfy policy
      await createClosedConsultation(
        prisma,
        doctorUserId,
        patientUserId,
        new Date(),
      );

      const doctorSocket = await connectChatSocket(baseUrl, doctor.accessToken);
      const patientSocket = await connectChatSocket(
        baseUrl,
        patient.accessToken,
      );

      await emitAck(doctorSocket, 'chat:join', { threadId });
      await emitAck(patientSocket, 'chat:join', { threadId });

      const clientMessageId = randomUUID();

      const patientReceived = waitForEvent<{ message: any }>(
        patientSocket,
        'chat:message',
      );
      const doctorReceived = waitForEvent<{ message: any }>(
        doctorSocket,
        'chat:message',
      );

      const ack = await emitAck<{ message: any }>(patientSocket, 'chat:send', {
        threadId,
        clientMessageId,
        kind: 'text',
        text: 'Hola desde patient',
      });

      expect(ack.message.id).toBeDefined();
      expect(ack.message.senderRole).toBe('patient');

      const event = await patientReceived;
      expect(event.message.id).toBe(ack.message.id);

      await doctorReceived; // Doctor also receives

      doctorSocket.disconnect();
      patientSocket.disconnect();
    });
  });

  // D) Policy enforcement
  describe('Policy enforcement', () => {
    it('RECENT_CONSULTATION_REQUIRED: patient needs recent consultation', async () => {
      const doctor = await registerAndLogin(app, 'doctor');
      const patient = await registerAndLogin(app, 'patient');
      await createDoctorProfile(app, doctor.accessToken);
      await createPatientIdentity(app, patient.accessToken);

      const doctorUserId = await getUserId(app, doctor.accessToken);
      const patientUserId = await getUserId(app, patient.accessToken);
      const threadId = await getOrCreateThread(
        app,
        doctor.accessToken,
        patientUserId,
      );

      // Set policy to require recent consultation
      await updateThreadPolicy(app, doctor.accessToken, threadId, {
        requireRecentConsultation: true,
        recentConsultationWindowHours: 72,
      });

      // Create OLD consultation (outside window)
      const oldDate = new Date();
      oldDate.setHours(oldDate.getHours() - 73);
      await createClosedConsultation(
        prisma,
        doctorUserId,
        patientUserId,
        oldDate,
      );

      const socket = await connectChatSocket(baseUrl, patient.accessToken);
      await emitAck(socket, 'chat:join', { threadId });

      await expect(
        emitAck(socket, 'chat:send', {
          threadId,
          clientMessageId: randomUUID(),
          kind: 'text',
          text: 'Hello',
        }),
      ).rejects.toThrow('RECENT_CONSULTATION_REQUIRED');

      socket.disconnect();
    });

    it('PATIENT_MESSAGING_DISABLED: patient messaging disabled', async () => {
      const doctor = await registerAndLogin(app, 'doctor');
      const patient = await registerAndLogin(app, 'patient');
      await createDoctorProfile(app, doctor.accessToken);
      await createPatientIdentity(app, patient.accessToken);

      const patientUserId = await getUserId(app, patient.accessToken);
      const threadId = await getOrCreateThread(
        app,
        doctor.accessToken,
        patientUserId,
      );

      await updateThreadPolicy(app, doctor.accessToken, threadId, {
        patientCanMessage: false,
        requireRecentConsultation: false,
      });

      const socket = await connectChatSocket(baseUrl, patient.accessToken);
      await emitAck(socket, 'chat:join', { threadId });

      await expect(
        emitAck(socket, 'chat:send', {
          threadId,
          clientMessageId: randomUUID(),
          kind: 'text',
          text: 'Hello',
        }),
      ).rejects.toThrow('PATIENT_MESSAGING_DISABLED');

      socket.disconnect();
    });

    it('THREAD_CLOSED_BY_DOCTOR: thread closed by doctor', async () => {
      const doctor = await registerAndLogin(app, 'doctor');
      const patient = await registerAndLogin(app, 'patient');
      await createDoctorProfile(app, doctor.accessToken);
      await createPatientIdentity(app, patient.accessToken);

      const patientUserId = await getUserId(app, patient.accessToken);
      const threadId = await getOrCreateThread(
        app,
        doctor.accessToken,
        patientUserId,
      );

      await updateThreadPolicy(app, doctor.accessToken, threadId, {
        closedByDoctor: true,
        patientCanMessage: true,
        requireRecentConsultation: false,
      });

      const socket = await connectChatSocket(baseUrl, patient.accessToken);
      await emitAck(socket, 'chat:join', { threadId });

      await expect(
        emitAck(socket, 'chat:send', {
          threadId,
          clientMessageId: randomUUID(),
          kind: 'text',
          text: 'Hello',
        }),
      ).rejects.toThrow('THREAD_CLOSED_BY_DOCTOR');

      socket.disconnect();
    });

    it('DAILY_LIMIT_REACHED: patient exceeds daily limit', async () => {
      const doctor = await registerAndLogin(app, 'doctor');
      const patient = await registerAndLogin(app, 'patient');
      await createDoctorProfile(app, doctor.accessToken);
      await createPatientIdentity(app, patient.accessToken);

      const doctorUserId = await getUserId(app, doctor.accessToken);
      const patientUserId = await getUserId(app, patient.accessToken);
      const threadId = await getOrCreateThread(
        app,
        doctor.accessToken,
        patientUserId,
      );

      await updateThreadPolicy(app, doctor.accessToken, threadId, {
        dailyLimit: 1,
        requireRecentConsultation: false,
      });

      const socket = await connectChatSocket(baseUrl, patient.accessToken);
      await emitAck(socket, 'chat:join', { threadId });

      // First message OK
      await emitAck(socket, 'chat:send', {
        threadId,
        clientMessageId: randomUUID(),
        kind: 'text',
        text: 'First',
      });

      // Second message should fail
      await expect(
        emitAck(socket, 'chat:send', {
          threadId,
          clientMessageId: randomUUID(),
          kind: 'text',
          text: 'Second',
        }),
      ).rejects.toThrow('DAILY_LIMIT_REACHED');

      socket.disconnect();
    });

    it('RATE_LIMITED: patient exceeds burst limit', async () => {
      const doctor = await registerAndLogin(app, 'doctor');
      const patient = await registerAndLogin(app, 'patient');
      await createDoctorProfile(app, doctor.accessToken);
      await createPatientIdentity(app, patient.accessToken);

      const patientUserId = await getUserId(app, patient.accessToken);
      const threadId = await getOrCreateThread(
        app,
        doctor.accessToken,
        patientUserId,
      );

      await updateThreadPolicy(app, doctor.accessToken, threadId, {
        burstLimit: 1,
        burstWindowSeconds: 30,
        requireRecentConsultation: false,
      });

      const socket = await connectChatSocket(baseUrl, patient.accessToken);
      await emitAck(socket, 'chat:join', { threadId });

      // First message OK
      await emitAck(socket, 'chat:send', {
        threadId,
        clientMessageId: randomUUID(),
        kind: 'text',
        text: 'First',
      });

      // Second message immediately should fail
      await expect(
        emitAck(socket, 'chat:send', {
          threadId,
          clientMessageId: randomUUID(),
          kind: 'text',
          text: 'Second',
        }),
      ).rejects.toThrow('RATE_LIMITED');

      socket.disconnect();
    });
  });

  // E) Contexto consulta activa
  describe('Active consultation context', () => {
    it('sets contextConsultationId when consultation is in progress', async () => {
      const doctor = await registerAndLogin(app, 'doctor');
      const patient = await registerAndLogin(app, 'patient');
      await createDoctorProfile(app, doctor.accessToken);
      await createPatientIdentity(app, patient.accessToken);

      const doctorUserId = await getUserId(app, doctor.accessToken);
      const patientUserId = await getUserId(app, patient.accessToken);
      const threadId = await getOrCreateThread(
        app,
        doctor.accessToken,
        patientUserId,
      );

      // Create in-progress consultation
      const consultation = await createInProgressConsultation(
        prisma,
        doctorUserId,
        patientUserId,
      );

      const socket = await connectChatSocket(baseUrl, patient.accessToken);
      await emitAck(socket, 'chat:join', { threadId });

      const ack = await emitAck<{ message: any }>(socket, 'chat:send', {
        threadId,
        clientMessageId: randomUUID(),
        kind: 'text',
        text: 'Hello',
      });

      expect(ack.message.contextConsultationId).toBe(consultation.id);

      socket.disconnect();
    });
  });

  // F) Validaciones payload
  describe('Payload validation', () => {
    it('INVALID_ARGUMENT: invalid kind', async () => {
      const doctor = await registerAndLogin(app, 'doctor');
      const patient = await registerAndLogin(app, 'patient');
      await createDoctorProfile(app, doctor.accessToken);
      await createPatientIdentity(app, patient.accessToken);

      const patientUserId = await getUserId(app, patient.accessToken);
      const threadId = await getOrCreateThread(
        app,
        doctor.accessToken,
        patientUserId,
      );

      const socket = await connectChatSocket(baseUrl, doctor.accessToken);
      await emitAck(socket, 'chat:join', { threadId });

      await expect(
        emitAck(socket, 'chat:send', {
          threadId,
          clientMessageId: randomUUID(),
          kind: 'file',
          text: 'Hello',
        }),
      ).rejects.toThrow('INVALID_ARGUMENT');

      socket.disconnect();
    });

    it('INVALID_ARGUMENT: empty text', async () => {
      const doctor = await registerAndLogin(app, 'doctor');
      const patient = await registerAndLogin(app, 'patient');
      await createDoctorProfile(app, doctor.accessToken);
      await createPatientIdentity(app, patient.accessToken);

      const patientUserId = await getUserId(app, patient.accessToken);
      const threadId = await getOrCreateThread(
        app,
        doctor.accessToken,
        patientUserId,
      );

      const socket = await connectChatSocket(baseUrl, doctor.accessToken);
      await emitAck(socket, 'chat:join', { threadId });

      await expect(
        emitAck(socket, 'chat:send', {
          threadId,
          clientMessageId: randomUUID(),
          kind: 'text',
          text: '',
        }),
      ).rejects.toThrow('INVALID_ARGUMENT');

      socket.disconnect();
    });
  });

  // G) Dedupe / idempotencia
  describe('Deduplication', () => {
    it('deduplicates by clientMessageId and emits broadcast on duplicate', async () => {
      const doctor = await registerAndLogin(app, 'doctor');
      const patient = await registerAndLogin(app, 'patient');
      await createDoctorProfile(app, doctor.accessToken);
      await createPatientIdentity(app, patient.accessToken);

      const patientUserId = await getUserId(app, patient.accessToken);
      const threadId = await getOrCreateThread(
        app,
        doctor.accessToken,
        patientUserId,
      );

      const doctorSocket = await connectChatSocket(baseUrl, doctor.accessToken);
      const patientSocket = await connectChatSocket(
        baseUrl,
        patient.accessToken,
      );

      await emitAck(doctorSocket, 'chat:join', { threadId });
      await emitAck(patientSocket, 'chat:join', { threadId });

      const clientMessageId = randomUUID();
      const messageText = 'Dedupe test';

      // Listen for broadcasts
      const events: any[] = [];
      doctorSocket.on('chat:message', (payload) => {
        events.push(payload);
      });
      patientSocket.on('chat:message', (payload) => {
        events.push(payload);
      });

      // First send
      const ack1 = await emitAck<{ message: any }>(doctorSocket, 'chat:send', {
        threadId,
        clientMessageId,
        kind: 'text',
        text: messageText,
      });

      // Wait a bit for broadcasts
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Second send (duplicate)
      const ack2 = await emitAck<{ message: any }>(doctorSocket, 'chat:send', {
        threadId,
        clientMessageId,
        kind: 'text',
        text: messageText,
      });

      // Wait for second batch of broadcasts
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Same message ID
      expect(ack1.message.id).toBe(ack2.message.id);

      // Should have received 2 broadcasts (one per send, even though deduplicated)
      // 2 sockets × 2 sends = 4 events total
      expect(events.length).toBeGreaterThanOrEqual(2);
      expect(events.every((e) => e.message.id === ack1.message.id)).toBe(true);

      doctorSocket.disconnect();
      patientSocket.disconnect();
    });
  });

  // H) HTTP endpoints
  describe('HTTP endpoints', () => {
    it('GET /threads/:threadId/messages returns sent messages', async () => {
      const doctor = await registerAndLogin(app, 'doctor');
      const patient = await registerAndLogin(app, 'patient');
      await createDoctorProfile(app, doctor.accessToken);
      await createPatientIdentity(app, patient.accessToken);

      const patientUserId = await getUserId(app, patient.accessToken);
      const threadId = await getOrCreateThread(
        app,
        doctor.accessToken,
        patientUserId,
      );

      const socket = await connectChatSocket(baseUrl, doctor.accessToken);
      await emitAck(socket, 'chat:join', { threadId });

      const ack = await emitAck<{ message: any }>(socket, 'chat:send', {
        threadId,
        clientMessageId: randomUUID(),
        kind: 'text',
        text: 'HTTP test message',
      });

      socket.disconnect();

      // Get messages via HTTP
      const response = await request(httpServer(app))
        .get(`/api/v1/chats/threads/${threadId}/messages`)
        .set('Authorization', `Bearer ${doctor.accessToken}`)
        .query({ limit: 50 })
        .expect(200);

      expect(response.body.items).toBeDefined();
      expect(response.body.items.length).toBeGreaterThan(0);
      const message = response.body.items.find(
        (m: any) => m.id === ack.message.id,
      );
      expect(message).toBeDefined();
      expect(message.text).toBe('HTTP test message');
    });

    it('GET /threads/:threadId/messages with cursor pagination', async () => {
      const doctor = await registerAndLogin(app, 'doctor');
      const patient = await registerAndLogin(app, 'patient');
      await createDoctorProfile(app, doctor.accessToken);
      await createPatientIdentity(app, patient.accessToken);

      const patientUserId = await getUserId(app, patient.accessToken);
      const threadId = await getOrCreateThread(
        app,
        doctor.accessToken,
        patientUserId,
      );

      const socket = await connectChatSocket(baseUrl, doctor.accessToken);
      await emitAck(socket, 'chat:join', { threadId });

      // Create 3 messages
      const messages: string[] = [];
      for (let i = 0; i < 3; i++) {
        const ack = await emitAck<{ message: any }>(socket, 'chat:send', {
          threadId,
          clientMessageId: randomUUID(),
          kind: 'text',
          text: `Message ${i}`,
        });
        messages.push(ack.message.id);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      socket.disconnect();

      // First page with limit 2
      const firstPage = await request(httpServer(app))
        .get(`/api/v1/chats/threads/${threadId}/messages`)
        .set('Authorization', `Bearer ${doctor.accessToken}`)
        .query({ limit: 2 })
        .expect(200);

      expect(firstPage.body.items.length).toBe(2);
      expect(firstPage.body.pageInfo.hasNextPage).toBe(true);
      expect(firstPage.body.pageInfo.endCursor).toBeDefined();

      // Second page
      const secondPage = await request(httpServer(app))
        .get(`/api/v1/chats/threads/${threadId}/messages`)
        .set('Authorization', `Bearer ${doctor.accessToken}`)
        .query({
          limit: 2,
          cursor: firstPage.body.pageInfo.endCursor,
        })
        .expect(200);

      expect(secondPage.body.items.length).toBeGreaterThan(0);
    });

    it('GET /threads lists threads for user', async () => {
      const doctor = await registerAndLogin(app, 'doctor');
      const patient = await registerAndLogin(app, 'patient');
      await createDoctorProfile(app, doctor.accessToken);
      await createPatientIdentity(app, patient.accessToken);

      const patientUserId = await getUserId(app, patient.accessToken);
      await getOrCreateThread(app, doctor.accessToken, patientUserId);

      const response = await request(httpServer(app))
        .get('/api/v1/chats/threads')
        .set('Authorization', `Bearer ${doctor.accessToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0].id).toBeDefined();
    });
  });

  // I) Admin access
  describe('Admin access', () => {
    it('admin cannot access thread content', async () => {
      const doctor = await registerAndLogin(app, 'doctor');
      const patient = await registerAndLogin(app, 'patient');
      const admin = await registerAndLogin(app, 'admin');
      await createDoctorProfile(app, doctor.accessToken);
      await createPatientIdentity(app, patient.accessToken);

      const patientUserId = await getUserId(app, patient.accessToken);
      const threadId = await getOrCreateThread(
        app,
        doctor.accessToken,
        patientUserId,
      );

      // Admin cannot get thread
      await request(httpServer(app))
        .get(`/api/v1/chats/threads/${threadId}/messages`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(403);

      // Admin cannot join via WS (should fail on join)
      const socket = await connectChatSocket(baseUrl, admin.accessToken);
      await expect(emitAck(socket, 'chat:join', { threadId })).rejects.toThrow(
        /FORBIDDEN/,
      );

      socket.disconnect();
    });
  });
});
