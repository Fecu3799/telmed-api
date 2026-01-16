import {
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
  UnprocessableEntityException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AppointmentStatus,
  ConsultationQueuePaymentStatus,
  PaymentKind,
  PaymentProvider,
  PaymentStatus,
  UserRole,
  AuditAction,
  WebhookProvider,
} from '@prisma/client';
import { Prisma } from '@prisma/client';
import { randomUUID, createHmac, timingSafeEqual } from 'crypto';
import { CLOCK, type Clock } from '../../common/clock/clock';
import type { Actor } from '../../common/types/actor.type';
import { AuditService } from '../../infra/audit/audit.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { MERCADOPAGO_CLIENT } from './mercadopago.client';
import type { MercadoPagoClient } from './mercadopago.client';
import { NotificationsService } from '../notifications/notifications.service';

const PAYMENT_TTL_MINUTES = 10;

type PaymentPreferenceResult = {
  paymentId: string;
  providerPreferenceId: string;
  checkoutUrl: string;
  expiresAt: Date;
};

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly auditService: AuditService,
    private readonly notifications: NotificationsService,
    @Inject(MERCADOPAGO_CLIENT)
    private readonly mercadoPago: MercadoPagoClient,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}
  private readonly logger = new Logger(PaymentsService.name);

  async createAppointmentPaymentPreference(input: {
    doctorUserId: string;
    patientUserId: string;
    appointmentId: string;
    amountCents: number;
    currency: string;
    idempotencyKey?: string | null;
  }): Promise<PaymentPreferenceResult> {
    const expiresAt = new Date(
      this.clock.now().getTime() + PAYMENT_TTL_MINUTES * 60 * 1000,
    );
    const paymentId = randomUUID();

    const accessToken = await this.resolveAccessToken(input.doctorUserId);

    const preference = await this.mercadoPago.createPreference({
      title: 'TelMed - Turno programado',
      amountCents: input.amountCents,
      currency: input.currency,
      externalReference: paymentId,
      metadata: {
        paymentId,
        kind: PaymentKind.appointment,
        appointmentId: input.appointmentId,
        doctorUserId: input.doctorUserId,
        patientUserId: input.patientUserId,
      },
      expiresAt,
      idempotencyKey: input.idempotencyKey ?? null,
      accessToken,
    });

    return {
      paymentId,
      providerPreferenceId: preference.providerPreferenceId,
      checkoutUrl: this.selectCheckoutUrl(preference),
      expiresAt,
    };
  }

  async createEmergencyPaymentPreference(input: {
    doctorUserId: string;
    patientUserId: string;
    queueItemId: string;
    amountCents: number;
    currency: string;
    idempotencyKey?: string | null;
  }): Promise<PaymentPreferenceResult> {
    const expiresAt = new Date(
      this.clock.now().getTime() + PAYMENT_TTL_MINUTES * 60 * 1000,
    );
    const paymentId = randomUUID();

    const accessToken = await this.resolveAccessToken(input.doctorUserId);

    const preference = await this.mercadoPago.createPreference({
      title: 'TelMed - Emergencia',
      amountCents: input.amountCents,
      currency: input.currency,
      externalReference: paymentId,
      metadata: {
        paymentId,
        kind: PaymentKind.emergency,
        queueId: input.queueItemId,
        queueItemId: input.queueItemId,
        doctorUserId: input.doctorUserId,
        patientUserId: input.patientUserId,
      },
      expiresAt,
      idempotencyKey: input.idempotencyKey ?? null,
      accessToken,
    });

    return {
      paymentId,
      providerPreferenceId: preference.providerPreferenceId,
      checkoutUrl: this.selectCheckoutUrl(preference),
      expiresAt,
    };
  }

  async findIdempotentPayment(
    patientUserId: string,
    kind: PaymentKind,
    idempotencyKey?: string | null,
  ) {
    if (!idempotencyKey) {
      return null;
    }

    return this.prisma.payment.findFirst({
      where: {
        patientUserId,
        kind,
        idempotencyKey,
      },
    });
  }

  async persistAppointmentPayment(input: {
    paymentId: string;
    appointmentId: string;
    doctorUserId: string;
    patientUserId: string;
    amountCents: number;
    currency: string;
    providerPreferenceId: string;
    checkoutUrl: string;
    expiresAt: Date;
    idempotencyKey?: string | null;
  }) {
    if (!input.appointmentId) {
      throw new UnprocessableEntityException('appointmentId is required');
    }
    return this.prisma.payment.create({
      data: {
        id: input.paymentId,
        provider: PaymentProvider.mercadopago,
        kind: PaymentKind.appointment,
        status: PaymentStatus.pending,
        amountCents: input.amountCents,
        currency: input.currency,
        doctorUserId: input.doctorUserId,
        patientUserId: input.patientUserId,
        appointmentId: input.appointmentId,
        queueItemId: null,
        checkoutUrl: input.checkoutUrl,
        providerPreferenceId: input.providerPreferenceId,
        idempotencyKey: input.idempotencyKey ?? null,
        expiresAt: input.expiresAt,
      },
    });
  }

  async persistEmergencyPayment(input: {
    paymentId: string;
    queueItemId: string;
    doctorUserId: string;
    patientUserId: string;
    amountCents: number;
    currency: string;
    providerPreferenceId: string;
    checkoutUrl: string;
    expiresAt: Date;
    idempotencyKey?: string | null;
  }) {
    if (!input.queueItemId) {
      throw new UnprocessableEntityException('queueItemId is required');
    }
    return this.prisma.payment.create({
      data: {
        id: input.paymentId,
        provider: PaymentProvider.mercadopago,
        kind: PaymentKind.emergency,
        status: PaymentStatus.pending,
        amountCents: input.amountCents,
        currency: input.currency,
        doctorUserId: input.doctorUserId,
        patientUserId: input.patientUserId,
        appointmentId: null,
        queueItemId: input.queueItemId,
        checkoutUrl: input.checkoutUrl,
        providerPreferenceId: input.providerPreferenceId,
        idempotencyKey: input.idempotencyKey ?? null,
        expiresAt: input.expiresAt,
      },
    });
  }

  async getPaymentById(actor: Actor, paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        provider: true,
        kind: true,
        status: true,
        amountCents: true,
        currency: true,
        doctorUserId: true,
        patientUserId: true,
        appointmentId: true,
        queueItemId: true,
        checkoutUrl: true,
        providerPreferenceId: true,
        providerPaymentId: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (actor.role === UserRole.doctor && payment.doctorUserId !== actor.id) {
      throw new ForbiddenException('Forbidden');
    }

    if (actor.role !== UserRole.admin && actor.role !== UserRole.doctor) {
      throw new ForbiddenException('Forbidden');
    }

    return payment;
  }

  async expirePendingAppointmentPayments(scope: {
    doctorUserId?: string;
    patientUserId?: string;
  }) {
    const now = this.clock.now();

    await this.prisma.payment.updateMany({
      where: {
        kind: PaymentKind.appointment,
        status: PaymentStatus.pending,
        expiresAt: { lt: now },
        ...(scope.doctorUserId ? { doctorUserId: scope.doctorUserId } : {}),
        ...(scope.patientUserId ? { patientUserId: scope.patientUserId } : {}),
      },
      data: { status: PaymentStatus.expired },
    });

    await this.prisma.appointment.updateMany({
      where: {
        status: AppointmentStatus.pending_payment,
        paymentExpiresAt: { lt: now },
        ...(scope.doctorUserId ? { doctorUserId: scope.doctorUserId } : {}),
        ...(scope.patientUserId
          ? { patient: { userId: scope.patientUserId } }
          : {}),
      },
      data: { status: AppointmentStatus.cancelled },
    });
  }

  async handleMercadoPagoWebhook(input: {
    body: any;
    signature?: string | string[];
    requestId?: string | string[];
    dataId?: string;
    traceId?: string | null;
    topic?: string;
    queryId?: string;
    resource?: string;
  }) {
    this.validateWebhookSignature(input);

    const eventId =
      input.body?.id ??
      input.body?.data?.id ??
      input.dataId ??
      input.queryId ??
      null;

    if (!eventId) {
      this.logWebhookResult(input, 'skipped');
      throw new BadRequestException('Missing webhook event id');
    }

    try {
      await this.prisma.webhookEvent.create({
        data: {
          provider: WebhookProvider.mercadopago,
          eventId: String(eventId),
          status: 'received',
          payload: input.body ?? {},
          traceId: input.traceId ?? null,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.logWebhookResult(input, 'skipped');
        return { received: true, duplicate: true };
      }
      throw error;
    }

    const topic = input.topic ?? undefined;
    const resource = input.resource ?? undefined;
    const queryId = input.queryId ?? undefined;

    if (
      topic === 'merchant_order' ||
      (resource && resource.includes('/merchant_orders/'))
    ) {
      const merchantOrderId =
        queryId ?? this.extractMerchantOrderId(resource ?? '');
      if (!merchantOrderId) {
        this.logWebhookResult(input, 'skipped');
        return { skipped: true };
      }
      const order = await this.mercadoPago.getMerchantOrder(
        String(merchantOrderId),
      );
      const paymentIds =
        order.payments?.map((payment) => String(payment.id)) ?? [];
      if (paymentIds.length === 0) {
        await this.prisma.webhookEvent.update({
          where: { eventId: String(eventId) },
          data: { status: 'ignored', processedAt: this.clock.now() },
        });
        this.logWebhookResult(input, 'skipped');
        return { skipped: true };
      }
      for (const mpPaymentId of paymentIds) {
        await this.processPaymentId(mpPaymentId, input.traceId ?? null);
      }
      await this.prisma.webhookEvent.update({
        where: { eventId: String(eventId) },
        data: { status: 'processed', processedAt: this.clock.now() },
      });
      this.logWebhookResult(input, 'processed');
      return { processed: true };
    }

    const paymentId =
      queryId ??
      input.dataId ??
      input.body?.data?.id ??
      input.body?.id ??
      input.body?.data?.payment_id;

    if (!paymentId) {
      await this.prisma.webhookEvent.update({
        where: { eventId: String(eventId) },
        data: { status: 'ignored', processedAt: this.clock.now() },
      });
      this.logWebhookResult(input, 'skipped');
      return { skipped: true };
    }

    await this.processPaymentId(String(paymentId), input.traceId ?? null);
    await this.prisma.webhookEvent.update({
      where: { eventId: String(eventId) },
      data: { status: 'processed', processedAt: this.clock.now() },
    });
    this.logWebhookResult(input, 'processed');
    return { processed: true };
  }

  private mapMercadoPagoStatus(status: string): PaymentStatus {
    switch (status) {
      case 'approved':
        return PaymentStatus.paid;
      case 'pending':
      case 'in_process':
        return PaymentStatus.pending;
      case 'rejected':
      case 'cancelled':
      case 'expired':
        return PaymentStatus.failed;
      default:
        return PaymentStatus.failed;
    }
  }

  private validateWebhookSignature(input: {
    body: unknown;
    signature?: string | string[];
    requestId?: string | string[];
    dataId?: string;
    topic?: string;
    queryId?: string;
    resource?: string;
  }) {
    const isProduction = process.env.NODE_ENV === 'production';
    const secret = this.config.getOrThrow<string>('MERCADOPAGO_WEBHOOK_SECRET');
    const signatureHeader = Array.isArray(input.signature)
      ? input.signature[0]
      : input.signature;
    const requestId = Array.isArray(input.requestId)
      ? input.requestId[0]
      : input.requestId;

    const signatureParts = signatureHeader?.split(',') ?? [];
    const tsPart = signatureParts.find((part) => part.startsWith('ts='));
    const v1Part = signatureParts.find((part) => part.startsWith('v1='));
    const ts = tsPart?.split('=')[1];
    const v1 = v1Part?.split('=')[1];

    const dataId =
      input.dataId ??
      input.queryId ??
      (typeof input.body === 'object' && input.body !== null
        ? (input.body as { data?: { id?: string } })?.data?.id
        : undefined);

    const manifest =
      ts && dataId && requestId
        ? `id:${dataId};request-id:${requestId};ts:${ts};`
        : null;

    const expected = manifest
      ? createHmac('sha256', secret).update(manifest).digest('hex')
      : null;

    const expectedBuffer =
      expected !== null ? Buffer.from(expected, 'utf8') : null;
    const receivedBuffer = v1 !== undefined ? Buffer.from(v1, 'utf8') : null;

    const matches =
      expectedBuffer !== null &&
      receivedBuffer !== null &&
      expectedBuffer.length === receivedBuffer.length &&
      timingSafeEqual(expectedBuffer, receivedBuffer);

    if (!matches) {
      if (!isProduction) {
        this.logger.warn(
          JSON.stringify({
            dataId: dataId ?? null,
            requestId: requestId ?? null,
            ts: ts ?? null,
            v1Received: v1 ?? null,
            v1Expected: expected ?? null,
            secretPrefix: secret.slice(0, 6),
          }),
        );
        return;
      }
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }

  private selectCheckoutUrl(preference: {
    initPoint: string;
    sandboxInitPoint: string;
  }) {
    const mode =
      this.config.get<'sandbox' | 'live'>('MERCADOPAGO_MODE') ??
      (process.env.NODE_ENV === 'production' ? 'live' : 'sandbox');

    return mode === 'live' ? preference.initPoint : preference.sandboxInitPoint;
  }

  private async resolveAccessToken(doctorUserId: string) {
    const account = await this.prisma.doctorPaymentAccount.findUnique({
      where: { doctorUserId },
      select: { accessTokenEncrypted: true },
    });

    if (account?.accessTokenEncrypted) {
      return account.accessTokenEncrypted;
    }

    return this.config.getOrThrow<string>('MERCADOPAGO_ACCESS_TOKEN');
  }

  private logWebhookDebug(paymentInfo: {
    id?: string | number | null;
    status?: string | null;
    external_reference?: string | null;
    metadata?: Record<string, string> | null;
  }) {
    const metadata = paymentInfo.metadata ?? {};
    const payload = {
      mpPaymentId: paymentInfo.id ?? null,
      mpStatus: paymentInfo.status ?? null,
      externalReference: paymentInfo.external_reference ?? null,
      metadataPaymentId: metadata.paymentId ?? null,
      metadataQueueId: metadata.queueId ?? null,
    };
    // Avoid throwing if logger is not configured.

    console.info(JSON.stringify(payload));
  }

  private extractMerchantOrderId(resource: string) {
    const parts = resource.split('/merchant_orders/');
    if (parts.length < 2) {
      return null;
    }
    const id = parts[1]?.split('?')[0];
    return id || null;
  }

  private logWebhookResult(
    input: {
      topic?: string;
      queryId?: string;
      resource?: string;
      traceId?: string | null;
    },
    result: 'processed' | 'skipped',
  ) {
    this.logger.log(
      JSON.stringify({
        traceId: input.traceId ?? null,
        topic: input.topic ?? null,
        queryId: input.queryId ?? null,
        resource: input.resource ?? null,
        result,
      }),
    );
  }

  private async processPaymentId(mpPaymentId: string, traceId: string | null) {
    const paymentInfo = await this.mercadoPago.getPayment(String(mpPaymentId));

    const paymentRecordId =
      paymentInfo.external_reference ?? paymentInfo.metadata?.paymentId;

    if (!paymentRecordId) {
      if (process.env.NODE_ENV !== 'production') {
        this.logWebhookDebug(paymentInfo);
      }
      this.logger.log(
        JSON.stringify({
          traceId,
          mpPaymentId: paymentInfo.id ?? null,
          status: 'not-found',
        }),
      );
      return;
    }

    const existing = await this.prisma.payment.findUnique({
      where: { id: String(paymentRecordId) },
    });

    if (!existing) {
      this.logger.log(
        JSON.stringify({
          traceId,
          mpPaymentId: paymentInfo.id ?? null,
          status: 'not-found',
        }),
      );
      return;
    }

    const mappedStatus = this.mapMercadoPagoStatus(paymentInfo.status);
    if (existing.providerPaymentId && existing.status === mappedStatus) {
      return;
    }
    if (process.env.NODE_ENV !== 'production') {
      this.logWebhookDebug(paymentInfo);
    }

    const updated = await this.prisma.payment.update({
      where: { id: existing.id },
      data: {
        status: mappedStatus,
        providerPaymentId: existing.providerPaymentId ?? String(paymentInfo.id),
      },
    });

    await this.auditService.log({
      action: AuditAction.WEBHOOK,
      resourceType: 'Payment',
      resourceId: updated.id,
      actor: null,
      traceId,
      metadata: { status: mappedStatus },
    });

    if (updated.kind === PaymentKind.appointment) {
      if (mappedStatus === PaymentStatus.paid) {
        const appointment = await this.prisma.appointment.update({
          where: { id: updated.appointmentId ?? '' },
          data: { status: AppointmentStatus.confirmed },
          include: { patient: { select: { userId: true } } },
        });
        await this.auditService.log({
          action: AuditAction.WEBHOOK,
          resourceType: 'Appointment',
          resourceId: updated.appointmentId ?? updated.id,
          actor: null,
          traceId,
          metadata: { paymentId: updated.id, status: mappedStatus },
        });
        // Notify both doctor and patient when appointment is confirmed.
        this.notifications.appointmentsChanged([
          appointment.doctorUserId,
          appointment.patient.userId,
        ]);
      }
    } else if (updated.kind === PaymentKind.emergency) {
      let queuePaymentStatus: ConsultationQueuePaymentStatus | null = null;
      if (mappedStatus === PaymentStatus.paid) {
        queuePaymentStatus = ConsultationQueuePaymentStatus.paid;
      } else if (mappedStatus === PaymentStatus.failed) {
        queuePaymentStatus = ConsultationQueuePaymentStatus.failed;
      }

      if (queuePaymentStatus) {
        const queueItem = await this.prisma.consultationQueueItem.update({
          where: { id: updated.queueItemId ?? '' },
          data: { paymentStatus: queuePaymentStatus },
        });
        await this.auditService.log({
          action: AuditAction.WEBHOOK,
          resourceType: 'ConsultationQueueItem',
          resourceId: updated.queueItemId ?? updated.id,
          actor: null,
          traceId,
          metadata: { paymentId: updated.id, status: mappedStatus },
        });
        // Notify doctor and patient about emergency payment updates.
        this.notifications.emergenciesChanged([
          queueItem.doctorUserId,
          queueItem.patientUserId,
        ]);
      }
    }

    this.logger.log(
      JSON.stringify({
        traceId,
        mpPaymentId: paymentInfo.id ?? null,
        status: updated.status,
      }),
    );
  }
}
