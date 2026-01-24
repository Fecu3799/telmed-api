import { http } from './http';
import { endpoints } from './endpoints';

export interface PatientIdentity {
  id: string;
  userId: string;
  legalFirstName: string | null;
  legalLastName: string | null;
  documentType: string | null;
  documentNumber: string | null;
  documentCountry: string | null;
  birthDate: string | null;
  phone: string | null;
  addressText: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  insuranceName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PatientIdentityPatch {
  legalFirstName?: string;
  legalLastName?: string;
  documentType?: 'DNI' | 'PASSPORT' | 'LC' | 'LE';
  documentNumber?: string;
  documentCountry?: string;
  birthDate?: string;
  phone?: string | null;
  addressText?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  insuranceName?: string | null;
}

export async function getPatientIdentity(): Promise<PatientIdentity> {
  return http<PatientIdentity>(endpoints.patientIdentity.get);
}

export async function patchPatientIdentity(
  data: PatientIdentityPatch,
): Promise<PatientIdentity> {
  return http<PatientIdentity>(endpoints.patientIdentity.patch, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}
