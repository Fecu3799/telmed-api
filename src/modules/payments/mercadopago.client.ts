import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID, createHmac } from 'crypto';

export type MercadoPagoPreferenceInput = {
  title: string;
  amountCents: number;
  currency: string;
  externalReference: string;
  metadata: Record<string, string>;
  expiresAt: Date;
  idempotencyKey?: string | null;
  accessToken?: string | null;
};

export type MercadoPagoPreferenceOutput = {
  providerPreferenceId: string;
  checkoutUrl: string;
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

export interface MercadoPagoClient {
  createPreference(
    input: MercadoPagoPreferenceInput,
  ): Promise<MercadoPagoPreferenceOutput>;
  getPayment(
    paymentId: string,
    accessToken?: string | null,
  ): Promise<MercadoPagoPayment>;
}

export const MERCADOPAGO_CLIENT = Symbol('MERCADOPAGO_CLIENT');

@Injectable()
export class MercadoPagoHttpClient implements MercadoPagoClient {
  private readonly baseUrl: string;
  private readonly defaultAccessToken: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl =
      this.config.get<string>('MERCADOPAGO_BASE_URL') ??
      'https://api.mercadopago.com';
    this.defaultAccessToken = this.config.getOrThrow<string>(
      'MERCADOPAGO_ACCESS_TOKEN',
    );
  }

  async createPreference(
    input: MercadoPagoPreferenceInput,
  ): Promise<MercadoPagoPreferenceOutput> {
    const accessToken = input.accessToken ?? this.defaultAccessToken;
    const url = `${this.baseUrl}/checkout/preferences`;

    const body = {
      items: [
        {
          title: input.title,
          quantity: 1,
          unit_price: input.amountCents / 100,
          currency_id: input.currency,
        },
      ],
      external_reference: input.externalReference,
      metadata: input.metadata,
      expires: true,
      expiration_date_from: new Date().toISOString(),
      expiration_date_to: input.expiresAt.toISOString(),
    };

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

    const data = (await response.json()) as { id: string; init_point: string };
    return {
      providerPreferenceId: data.id,
      checkoutUrl: data.init_point,
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
) {
  const payload = `${requestId}.${JSON.stringify(body)}`;
  return createHmac('sha256', secret).update(payload).digest('hex');
}
