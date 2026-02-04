import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID, createHmac } from 'crypto';

export type MercadoPagoPreferenceInput = {
  title: string;
  totalChargedCents: number;
  currency: string;
  externalReference: string;
  metadata: Record<string, string>;
  expiresAt: Date;
  idempotencyKey?: string | null;
  accessToken?: string | null;
};

export type MercadoPagoPreferenceOutput = {
  providerPreferenceId: string;
  initPoint: string;
  sandboxInitPoint: string;
};

export type MercadoPagoPayment = {
  id: string;
  status: string;
  status_detail?: string | null;
  transaction_amount: number;
  currency_id: string;
  metadata?: Record<string, string>;
  external_reference?: string | null;
  collector_id?: string | number | null;
};

export type MercadoPagoMerchantOrder = {
  id: string | number;
  payments?: Array<{ id: string | number }>;
  external_reference?: string | null;
  preference_id?: string | null;
};

export interface MercadoPagoClient {
  createPreference(
    input: MercadoPagoPreferenceInput,
  ): Promise<MercadoPagoPreferenceOutput>;
  getPayment(
    paymentId: string,
    accessToken?: string | null,
  ): Promise<MercadoPagoPayment>;
  getMerchantOrder(
    merchantOrderId: string,
    accessToken?: string | null,
  ): Promise<MercadoPagoMerchantOrder>;
}

export const MERCADOPAGO_CLIENT = Symbol('MERCADOPAGO_CLIENT');

@Injectable()
export class MercadoPagoHttpClient implements MercadoPagoClient {
  private readonly baseUrl: string;
  private readonly defaultAccessToken: string;
  private readonly notificationUrl?: string;
  private readonly logger = new Logger(MercadoPagoHttpClient.name);

  constructor(private readonly config: ConfigService) {
    this.baseUrl =
      this.config.get<string>('MERCADOPAGO_BASE_URL') ??
      'https://api.mercadopago.com';
    this.defaultAccessToken = this.config.getOrThrow<string>(
      'MERCADOPAGO_ACCESS_TOKEN',
    );
    this.notificationUrl = this.config.get<string>('MERCADOPAGO_WEBHOOK_URL');
  }

  async createPreference(
    input: MercadoPagoPreferenceInput,
  ): Promise<MercadoPagoPreferenceOutput> {
    const accessToken = input.accessToken ?? this.defaultAccessToken;
    const url = `${this.baseUrl}/checkout/preferences`;

    const body: Record<string, unknown> = {
      items: [
        {
          title: input.title,
          quantity: 1,
          unit_price: input.totalChargedCents / 100,
          currency_id: input.currency,
        },
      ],
      external_reference: input.externalReference,
      metadata: input.metadata,
      expires: true,
      expiration_date_from: new Date().toISOString(),
      expiration_date_to: input.expiresAt.toISOString(),
    };
    if (this.notificationUrl) {
      body.notification_url = this.notificationUrl;
    }

    const response = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': input.idempotencyKey ?? randomUUID(),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MercadoPago create preference failed: ${errorText}`);
    }

    const data = (await response.json()) as {
      id: string;
      init_point: string;
      sandbox_init_point: string;
    };
    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(
        JSON.stringify({
          providerPreferenceId: data.id,
          notificationUrl: this.notificationUrl ?? null,
        }),
      );
    }
    return {
      providerPreferenceId: data.id,
      initPoint: data.init_point,
      sandboxInitPoint: data.sandbox_init_point,
    };
  }

  async getPayment(
    paymentId: string,
    accessToken?: string | null,
  ): Promise<MercadoPagoPayment> {
    const token = accessToken ?? this.defaultAccessToken;
    const url = `${this.baseUrl}/v1/payments/${paymentId}`;

    const response = await this.fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MercadoPago get payment failed: ${errorText}`);
    }

    return (await response.json()) as MercadoPagoPayment;
  }

  async getMerchantOrder(
    merchantOrderId: string,
    accessToken?: string | null,
  ): Promise<MercadoPagoMerchantOrder> {
    const token = accessToken ?? this.defaultAccessToken;
    const url = `${this.baseUrl}/merchant_orders/${merchantOrderId}`;

    const response = await this.fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MercadoPago get merchant order failed: ${errorText}`);
    }

    return (await response.json()) as MercadoPagoMerchantOrder;
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs = 5000,
  ) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function signWebhookPayload(
  secret: string,
  requestId: string,
  body: unknown,
  ts: string = Math.floor(Date.now() / 1000).toString(),
) {
  const dataId =
    typeof body === 'object' && body !== null
      ? (body as { data?: { id?: string } })?.data?.id
      : undefined;
  if (!dataId) {
    throw new Error('Missing data.id for webhook signature');
  }
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const signature = createHmac('sha256', secret).update(manifest).digest('hex');
  return `ts=${ts},v1=${signature}`;
}
