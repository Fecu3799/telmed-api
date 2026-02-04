import { http } from './http';
import { endpoints } from './endpoints';

export type DoctorPaymentAccountStatus =
  | 'not_configured'
  | 'connected'
  | 'disconnected';

export interface DoctorPaymentAccount {
  provider: string;
  mode: string;
  status: DoctorPaymentAccountStatus;
  devLabel?: string | null;
  updatedAt?: string | null;
}

export async function getMyDoctorPaymentAccount(): Promise<DoctorPaymentAccount> {
  return http<DoctorPaymentAccount>(endpoints.doctorPaymentAccount.get);
}

export async function upsertMyDoctorPaymentAccount(input: {
  devLabel: string;
}): Promise<DoctorPaymentAccount> {
  return http<DoctorPaymentAccount>(endpoints.doctorPaymentAccount.upsert, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function disconnectMyDoctorPaymentAccount(): Promise<DoctorPaymentAccount> {
  return http<DoctorPaymentAccount>(endpoints.doctorPaymentAccount.disconnect, {
    method: 'POST',
  });
}
