import type {
  MercadoPagoClient,
  MercadoPagoPayment,
  MercadoPagoPreferenceInput,
  MercadoPagoPreferenceOutput,
} from '../../src/modules/payments/mercadopago.client';

export class FakeMercadoPagoClient implements MercadoPagoClient {
  private preferences: MercadoPagoPreferenceInput[] = [];
  private payments = new Map<string, MercadoPagoPayment>();

  createPreference(
    input: MercadoPagoPreferenceInput,
  ): Promise<MercadoPagoPreferenceOutput> {
    this.preferences.push(input);
    const providerPreferenceId = `pref_${this.preferences.length}`;
    return Promise.resolve({
      providerPreferenceId,
      checkoutUrl: `https://mp.test/${providerPreferenceId}`,
    });
  }

  getPayment(paymentId: string): Promise<MercadoPagoPayment> {
    const payment = this.payments.get(paymentId);
    if (!payment) {
      return Promise.reject(new Error('Payment not found'));
    }
    return Promise.resolve(payment);
  }

  setPayment(paymentId: string, payment: MercadoPagoPayment) {
    this.payments.set(paymentId, payment);
  }
}
