import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentExpirationProcessor } from './payment-expiration.processor';
import { PaymentExpirationScheduler } from './payment-expiration.scheduler';
import { PAYMENTS_QUEUE } from './payment-expiration.constants';
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

const workersEnabled =
  String(process.env.WORKERS_ENABLED).toLowerCase() !== 'false' &&
  process.env.NODE_ENV !== 'test' &&
  process.env.APP_ENV !== 'test';

@Module({
  imports: [
    NotificationsModule,
    BullModule.registerQueueAsync({
      name: PAYMENTS_QUEUE,
      imports: [ConfigModule],
      useFactory: () => ({}),
    }),
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentExpirationScheduler,
    ...(workersEnabled ? [PaymentExpirationProcessor] : []),
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
