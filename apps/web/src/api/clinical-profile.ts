import { http } from './http';
import { endpoints } from './endpoints';

export type ClinicalProfileItem = {
  id: string;
  name: string;
  notes?: string | null;
  verificationStatus?: ClinicalVerificationStatus;
  isActive?: boolean;
  endedAt?: string | null;
  createdAt?: string;
};

export type ClinicalVerificationStatus = 'unverified' | 'verified' | 'disputed';

export type ClinicalProfileCreatePayload = {
  name: string;
  notes?: string | null;
  isActive?: boolean;
  endedAt?: string | null;
};

export type ClinicalProfileUpdatePayload = {
  name?: string;
  notes?: string | null;
  isActive?: boolean;
  endedAt?: string | null;
};

export type ClinicalProfilePageInfo = {
  page: number;
  pageSize: number;
  total: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  totalPages?: number;
};

export type ClinicalProfileResponse = {
  items: ClinicalProfileItem[];
  pageInfo: ClinicalProfilePageInfo;
};

type ClinicalProfileQuery = {
  page?: number;
  pageSize?: number;
};

function buildQuery(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    query.set(key, String(value));
  }
  return query.toString();
}

async function getClinicalProfileList(
  endpoint: string,
  params: ClinicalProfileQuery,
): Promise<ClinicalProfileResponse> {
  const query = buildQuery(
    params as Record<string, string | number | undefined>,
  );
  return http<ClinicalProfileResponse>(`${endpoint}?${query}`);
}

export async function getMyClinicalAllergies(
  page?: number,
  pageSize?: number,
): Promise<ClinicalProfileResponse> {
  return getClinicalProfileList(endpoints.clinicalProfile.allergies, {
    page,
    pageSize,
  });
}

export async function getMyClinicalMedications(
  page?: number,
  pageSize?: number,
): Promise<ClinicalProfileResponse> {
  return getClinicalProfileList(endpoints.clinicalProfile.medications, {
    page,
    pageSize,
  });
}

export async function getMyClinicalConditions(
  page?: number,
  pageSize?: number,
): Promise<ClinicalProfileResponse> {
  return getClinicalProfileList(endpoints.clinicalProfile.conditions, {
    page,
    pageSize,
  });
}

export async function getMyClinicalProcedures(
  page?: number,
  pageSize?: number,
): Promise<ClinicalProfileResponse> {
  return getClinicalProfileList(endpoints.clinicalProfile.procedures, {
    page,
    pageSize,
  });
}

export async function getPatientClinicalAllergies(
  patientUserId: string,
  page?: number,
  pageSize?: number,
): Promise<ClinicalProfileResponse> {
  return getClinicalProfileList(
    endpoints.clinicalProfile.allergiesForPatient(patientUserId),
    { page, pageSize },
  );
}

export async function getPatientClinicalMedications(
  patientUserId: string,
  page?: number,
  pageSize?: number,
): Promise<ClinicalProfileResponse> {
  return getClinicalProfileList(
    endpoints.clinicalProfile.medicationsForPatient(patientUserId),
    { page, pageSize },
  );
}

export async function getPatientClinicalConditions(
  patientUserId: string,
  page?: number,
  pageSize?: number,
): Promise<ClinicalProfileResponse> {
  return getClinicalProfileList(
    endpoints.clinicalProfile.conditionsForPatient(patientUserId),
    { page, pageSize },
  );
}

export async function getPatientClinicalProcedures(
  patientUserId: string,
  page?: number,
  pageSize?: number,
): Promise<ClinicalProfileResponse> {
  return getClinicalProfileList(
    endpoints.clinicalProfile.proceduresForPatient(patientUserId),
    { page, pageSize },
  );
}

async function createClinicalProfileItem(
  endpoint: string,
  payload: ClinicalProfileCreatePayload,
): Promise<ClinicalProfileItem> {
  return http<ClinicalProfileItem>(endpoint, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

async function updateClinicalProfileItem(
  endpoint: string,
  payload: ClinicalProfileUpdatePayload,
): Promise<ClinicalProfileItem> {
  return http<ClinicalProfileItem>(endpoint, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

async function deleteClinicalProfileItem(endpoint: string): Promise<void> {
  await http<void>(endpoint, { method: 'DELETE' });
}

async function setClinicalVerification(
  endpoint: string,
  verificationStatus: ClinicalVerificationStatus,
): Promise<ClinicalProfileItem> {
  return http<ClinicalProfileItem>(endpoint, {
    method: 'PATCH',
    body: JSON.stringify({ verificationStatus }),
  });
}

export async function createMyClinicalAllergy(
  payload: ClinicalProfileCreatePayload,
): Promise<ClinicalProfileItem> {
  return createClinicalProfileItem(
    endpoints.clinicalProfile.allergies,
    payload,
  );
}

export async function updateMyClinicalAllergy(
  id: string,
  payload: ClinicalProfileUpdatePayload,
): Promise<ClinicalProfileItem> {
  return updateClinicalProfileItem(
    `${endpoints.clinicalProfile.allergies}/${id}`,
    payload,
  );
}

export async function deleteMyClinicalAllergy(id: string): Promise<void> {
  await deleteClinicalProfileItem(
    `${endpoints.clinicalProfile.allergies}/${id}`,
  );
}

export async function createMyClinicalMedication(
  payload: ClinicalProfileCreatePayload,
): Promise<ClinicalProfileItem> {
  return createClinicalProfileItem(
    endpoints.clinicalProfile.medications,
    payload,
  );
}

export async function updateMyClinicalMedication(
  id: string,
  payload: ClinicalProfileUpdatePayload,
): Promise<ClinicalProfileItem> {
  return updateClinicalProfileItem(
    `${endpoints.clinicalProfile.medications}/${id}`,
    payload,
  );
}

export async function deleteMyClinicalMedication(id: string): Promise<void> {
  await deleteClinicalProfileItem(
    `${endpoints.clinicalProfile.medications}/${id}`,
  );
}

export async function createMyClinicalCondition(
  payload: ClinicalProfileCreatePayload,
): Promise<ClinicalProfileItem> {
  return createClinicalProfileItem(
    endpoints.clinicalProfile.conditions,
    payload,
  );
}

export async function updateMyClinicalCondition(
  id: string,
  payload: ClinicalProfileUpdatePayload,
): Promise<ClinicalProfileItem> {
  return updateClinicalProfileItem(
    `${endpoints.clinicalProfile.conditions}/${id}`,
    payload,
  );
}

export async function deleteMyClinicalCondition(id: string): Promise<void> {
  await deleteClinicalProfileItem(
    `${endpoints.clinicalProfile.conditions}/${id}`,
  );
}

export async function createMyClinicalProcedure(
  payload: ClinicalProfileCreatePayload,
): Promise<ClinicalProfileItem> {
  return createClinicalProfileItem(
    endpoints.clinicalProfile.procedures,
    payload,
  );
}

export async function updateMyClinicalProcedure(
  id: string,
  payload: ClinicalProfileUpdatePayload,
): Promise<ClinicalProfileItem> {
  return updateClinicalProfileItem(
    `${endpoints.clinicalProfile.procedures}/${id}`,
    payload,
  );
}

export async function deleteMyClinicalProcedure(id: string): Promise<void> {
  await deleteClinicalProfileItem(
    `${endpoints.clinicalProfile.procedures}/${id}`,
  );
}

export async function verifyPatientAllergy(
  patientUserId: string,
  allergyId: string,
): Promise<ClinicalProfileItem> {
  return setClinicalVerification(
    endpoints.clinicalProfile.verifyAllergyForPatient(patientUserId, allergyId),
    'verified',
  );
}

export async function disputePatientAllergy(
  patientUserId: string,
  allergyId: string,
): Promise<ClinicalProfileItem> {
  return setClinicalVerification(
    endpoints.clinicalProfile.verifyAllergyForPatient(patientUserId, allergyId),
    'disputed',
  );
}

export async function verifyPatientMedication(
  patientUserId: string,
  medicationId: string,
): Promise<ClinicalProfileItem> {
  return setClinicalVerification(
    endpoints.clinicalProfile.verifyMedicationForPatient(
      patientUserId,
      medicationId,
    ),
    'verified',
  );
}

export async function disputePatientMedication(
  patientUserId: string,
  medicationId: string,
): Promise<ClinicalProfileItem> {
  return setClinicalVerification(
    endpoints.clinicalProfile.verifyMedicationForPatient(
      patientUserId,
      medicationId,
    ),
    'disputed',
  );
}

export async function verifyPatientCondition(
  patientUserId: string,
  conditionId: string,
): Promise<ClinicalProfileItem> {
  return setClinicalVerification(
    endpoints.clinicalProfile.verifyConditionForPatient(
      patientUserId,
      conditionId,
    ),
    'verified',
  );
}

export async function disputePatientCondition(
  patientUserId: string,
  conditionId: string,
): Promise<ClinicalProfileItem> {
  return setClinicalVerification(
    endpoints.clinicalProfile.verifyConditionForPatient(
      patientUserId,
      conditionId,
    ),
    'disputed',
  );
}

export async function verifyPatientProcedure(
  patientUserId: string,
  procedureId: string,
): Promise<ClinicalProfileItem> {
  return setClinicalVerification(
    endpoints.clinicalProfile.verifyProcedureForPatient(
      patientUserId,
      procedureId,
    ),
    'verified',
  );
}

export async function disputePatientProcedure(
  patientUserId: string,
  procedureId: string,
): Promise<ClinicalProfileItem> {
  return setClinicalVerification(
    endpoints.clinicalProfile.verifyProcedureForPatient(
      patientUserId,
      procedureId,
    ),
    'disputed',
  );
}
