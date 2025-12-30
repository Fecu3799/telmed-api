import { Module } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import {
  MERCADOPAGO_CLIENT,
  MercadoPagoClient,
  MercadoPagoHttpClient,
  MercadoPagoPayment,
  MercadoPagoPreferenceInput,
  MercadoPagoPreferenceOutput,
  MercadoPagoMerchantOrder,
} from './mercadopago.client';

class MercadoPagoTestClient implements MercadoPagoClient {
  createPreference(
    _input: MercadoPagoPreferenceInput,
  ): Promise<MercadoPagoPreferenceOutput> {
    const id = `pref_test_${randomUUID()}`;
    return Promise.resolve({
      providerPreferenceId: id,
      initPoint: `https://mp.test/${id}`,
      sandboxInitPoint: `https://mp.test/${id}`,
    });
  }

  getPayment(_paymentId: string): Promise<MercadoPagoPayment> {
    return Promise.resolve({
      id: `pay_test_${randomUUID()}`,
      status: 'approved',
      transaction_amount: 0,
      currency_id: 'ARS',
      metadata: {},
    });
  }

  getMerchantOrder(
    _merchantOrderId: string,
  ): Promise<MercadoPagoMerchantOrder> {
    return Promise.resolve({
      id: `order_test_${randomUUID()}`,
      payments: [],
    });
  }
}

@Module({
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    {
      provide: MERCADOPAGO_CLIENT,
      useClass:
        process.env.NODE_ENV === 'test'
          ? MercadoPagoTestClient
          : MercadoPagoHttpClient,
    },
  ],
  exports: [PaymentsService, MERCADOPAGO_CLIENT],
})
export class PaymentsModule {}
