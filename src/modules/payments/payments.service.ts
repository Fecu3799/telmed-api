import {
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AppointmentStatus,
  ConsultationQueuePaymentStatus,
  PaymentKind,
  PaymentProvider,
  PaymentStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { CLOCK, type Clock } from '../../common/clock/clock';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { MERCADOPAGO_CLIENT, signWebhookPayload } from './mercadopago.client';
import type { MercadoPagoClient } from './mercadopago.client';

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
    @Inject(MERCADOPAGO_CLIENT)
    private readonly mercadoPago: MercadoPagoClient,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

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
      checkoutUrl: preference.checkoutUrl,
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
      checkoutUrl: preference.checkoutUrl,
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
        queueItemId: input.queueItemId,
        checkoutUrl: input.checkoutUrl,
        providerPreferenceId: input.providerPreferenceId,
        idempotencyKey: input.idempotencyKey ?? null,
        expiresAt: input.expiresAt,
      },
    });
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
        ...(scope.patientUserId ? { patientUserId: scope.patientUserId } : {}),
      },
      data: { status: AppointmentStatus.cancelled },
    });
  }

  async handleMercadoPagoWebhook(input: {
    body: any;
    signature?: string | string[];
    requestId?: string | string[];
  }) {
    this.validateWebhookSignature(input);

    const paymentId =
      input.body?.data?.id ?? input.body?.id ?? input.body?.data?.payment_id;

    if (!paymentId) {
      throw new NotFoundException('Payment id not found in webhook');
    }

    const paymentInfo = await this.mercadoPago.getPayment(String(paymentId));

    const paymentRecordId =
      paymentInfo.metadata?.paymentId ?? paymentInfo.external_reference;

    if (!paymentRecordId) {
      throw new NotFoundException('Payment metadata missing');
    }

    const existing = await this.prisma.payment.findUnique({
      where: { id: String(paymentRecordId) },
    });

    if (!existing) {
      throw new NotFoundException('Payment not found');
    }

    if (existing.providerPaymentId) {
      return existing;
    }

    const mappedStatus = this.mapMercadoPagoStatus(paymentInfo.status);

    const updated = await this.prisma.payment.update({
      where: { id: existing.id },
      data: {
        status: mappedStatus,
        providerPaymentId: String(paymentInfo.id),
      },
    });

    if (updated.kind === PaymentKind.appointment) {
      if (mappedStatus === PaymentStatus.paid) {
        await this.prisma.appointment.update({
          where: { id: updated.appointmentId ?? '' },
          data: { status: AppointmentStatus.confirmed },
        });
      }
    } else if (updated.kind === PaymentKind.emergency) {
      let queuePaymentStatus: ConsultationQueuePaymentStatus | null = null;
      if (mappedStatus === PaymentStatus.paid) {
        queuePaymentStatus = ConsultationQueuePaymentStatus.paid;
      } else if (mappedStatus === PaymentStatus.failed) {
        queuePaymentStatus = ConsultationQueuePaymentStatus.failed;
      } else if (mappedStatus === PaymentStatus.expired) {
        queuePaymentStatus = ConsultationQueuePaymentStatus.expired;
      }

      if (queuePaymentStatus) {
        await this.prisma.consultationQueueItem.update({
          where: { id: updated.queueItemId ?? '' },
          data: { paymentStatus: queuePaymentStatus },
        });
      }
    }

    return updated;
  }

  private mapMercadoPagoStatus(status: string): PaymentStatus {
    switch (status) {
      case 'approved':
        return PaymentStatus.paid;
      case 'rejected':
      case 'cancelled':
        return PaymentStatus.failed;
      case 'expired':
        return PaymentStatus.expired;
      default:
        return PaymentStatus.failed;
    }
  }

  private validateWebhookSignature(input: {
    body: unknown;
    signature?: string | string[];
    requestId?: string | string[];
  }) {
    const secret = this.config.getOrThrow<string>('MERCADOPAGO_WEBHOOK_SECRET');
    const signatureHeader = Array.isArray(input.signature)
      ? input.signature[0]
      : input.signature;
    const requestId = Array.isArray(input.requestId)
      ? input.requestId[0]
      : input.requestId;

    if (!signatureHeader || !requestId) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const expected = signWebhookPayload(secret, requestId, input.body);
    if (signatureHeader !== expected) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
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
}
