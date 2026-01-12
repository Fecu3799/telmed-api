import { http } from './http';
import { endpoints } from './endpoints';

// Types matching backend DTOs
export type PatientFileStatus =
  | 'pending_upload'
  | 'ready'
  | 'failed'
  | 'deleted';
export type PatientFileCategory = 'lab' | 'image' | 'prescription' | 'other';
export type UserRole = 'patient' | 'doctor' | 'admin';

export interface PatientFile {
  id: string;
  status: PatientFileStatus;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  category: PatientFileCategory;
  notes?: string | null;
  uploadedByUserId: string;
  uploadedByRole: UserRole;
  relatedConsultationId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PrepareUploadRequest {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  category?: PatientFileCategory;
  notes?: string;
  relatedConsultationId?: string;
  sha256?: string;
}

export interface PrepareUploadResponse {
  patientFileId: string;
  fileObjectId: string;
  uploadUrl: string;
  expiresAt: string;
}

export interface ConfirmUploadRequest {
  fileObjectId: string;
  sha256?: string;
}

export interface ConfirmUploadResponse {
  patientFileId: string;
}

export interface DownloadResponse {
  downloadUrl: string;
  expiresAt: string;
}

export interface DeleteResponse {
  patientFileId: string;
}

export interface ListFilesQuery {
  cursor?: string;
  limit?: number;
  category?: PatientFileCategory;
  relatedConsultationId?: string;
  q?: string;
  status?: PatientFileStatus;
}

export interface PageInfo {
  hasNextPage: boolean;
  endCursor?: string | null;
}

export interface ListFilesResponse {
  items: PatientFile[];
  pageInfo: PageInfo;
}

/**
 * Calculate SHA-256 hash of a file
 */
export async function calculateSHA256(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Upload file to presigned URL (PUT request)
 */
export async function uploadToPresignedUrl(
  uploadUrl: string,
  file: File,
  mimeType: string,
): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': mimeType,
    },
    body: file,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Upload failed: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }
}

// ==================== PATIENT ROUTES (self) ====================

/**
 * List patient files (patient self)
 */
export async function listFiles(
  query?: ListFilesQuery,
): Promise<ListFilesResponse> {
  const params = new URLSearchParams();
  if (query?.cursor) params.append('cursor', query.cursor);
  if (query?.limit) params.append('limit', query.limit.toString());
  if (query?.category) params.append('category', query.category);
  if (query?.relatedConsultationId)
    params.append('relatedConsultationId', query.relatedConsultationId);
  if (query?.q) params.append('q', query.q);
  if (query?.status) params.append('status', query.status);

  const queryString = params.toString();
  const url = queryString
    ? `${endpoints.patientFiles.list}?${queryString}`
    : endpoints.patientFiles.list;

  return http<ListFilesResponse>(url);
}

/**
 * Prepare file upload (patient self)
 */
export async function prepareUpload(
  data: PrepareUploadRequest,
): Promise<PrepareUploadResponse> {
  return http<PrepareUploadResponse>(endpoints.patientFiles.prepare, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Confirm file upload (patient self)
 */
export async function confirmUpload(
  patientFileId: string,
  data: ConfirmUploadRequest,
): Promise<ConfirmUploadResponse> {
  return http<ConfirmUploadResponse>(
    endpoints.patientFiles.confirm(patientFileId),
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
  );
}

/**
 * Get file metadata (patient self)
 */
export async function getFile(patientFileId: string): Promise<PatientFile> {
  return http<PatientFile>(endpoints.patientFiles.get(patientFileId));
}

/**
 * Get download URL (patient self)
 */
export async function getDownloadUrl(
  patientFileId: string,
): Promise<DownloadResponse> {
  return http<DownloadResponse>(endpoints.patientFiles.download(patientFileId));
}

/**
 * Delete file (patient self)
 */
export async function deleteFile(
  patientFileId: string,
): Promise<DeleteResponse> {
  return http<DeleteResponse>(endpoints.patientFiles.delete(patientFileId), {
    method: 'DELETE',
  });
}

// ==================== DOCTOR ROUTES (on behalf of patient) ====================

/**
 * List patient files (doctor)
 */
export async function listFilesForPatient(
  patientId: string,
  query?: ListFilesQuery,
): Promise<ListFilesResponse> {
  const params = new URLSearchParams();
  if (query?.cursor) params.append('cursor', query.cursor);
  if (query?.limit) params.append('limit', query.limit.toString());
  if (query?.category) params.append('category', query.category);
  if (query?.relatedConsultationId)
    params.append('relatedConsultationId', query.relatedConsultationId);
  if (query?.q) params.append('q', query.q);
  if (query?.status) params.append('status', query.status);

  const queryString = params.toString();
  const url = queryString
    ? `${endpoints.patientFiles.listForPatient(patientId)}?${queryString}`
    : endpoints.patientFiles.listForPatient(patientId);

  return http<ListFilesResponse>(url);
}

/**
 * Prepare file upload (doctor)
 */
export async function prepareUploadForPatient(
  patientId: string,
  data: PrepareUploadRequest,
): Promise<PrepareUploadResponse> {
  return http<PrepareUploadResponse>(
    endpoints.patientFiles.prepareForPatient(patientId),
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
  );
}

/**
 * Confirm file upload (doctor)
 */
export async function confirmUploadForPatient(
  patientId: string,
  patientFileId: string,
  data: ConfirmUploadRequest,
): Promise<ConfirmUploadResponse> {
  return http<ConfirmUploadResponse>(
    endpoints.patientFiles.confirmForPatient(patientId, patientFileId),
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
  );
}

/**
 * Get file metadata (doctor)
 */
export async function getFileForPatient(
  patientId: string,
  patientFileId: string,
): Promise<PatientFile> {
  return http<PatientFile>(
    endpoints.patientFiles.getForPatient(patientId, patientFileId),
  );
}

/**
 * Get download URL (doctor)
 */
export async function getDownloadUrlForPatient(
  patientId: string,
  patientFileId: string,
): Promise<DownloadResponse> {
  return http<DownloadResponse>(
    endpoints.patientFiles.downloadForPatient(patientId, patientFileId),
  );
}

/**
 * Delete file (doctor)
 */
export async function deleteFileForPatient(
  patientId: string,
  patientFileId: string,
): Promise<DeleteResponse> {
  return http<DeleteResponse>(
    endpoints.patientFiles.deleteForPatient(patientId, patientFileId),
    {
      method: 'DELETE',
    },
  );
}

/**
 * Complete upload flow: prepare → upload → confirm
 * Returns the confirmed PatientFile ID
 */
export async function uploadFile(
  file: File,
  options: {
    category?: PatientFileCategory;
    notes?: string;
    relatedConsultationId?: string;
    calculateChecksum?: boolean;
    onProgress?: (stage: 'preparing' | 'uploading' | 'confirming') => void;
  } = {},
): Promise<string> {
  const { calculateChecksum = false, onProgress } = options;

  // Calculate SHA-256 if requested
  let sha256: string | undefined;
  if (calculateChecksum) {
    onProgress?.('preparing');
    sha256 = await calculateSHA256(file);
  }

  // Prepare upload
  onProgress?.('preparing');
  const prepareResponse = await prepareUpload({
    originalName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    category: options.category,
    notes: options.notes,
    relatedConsultationId: options.relatedConsultationId,
    sha256,
  });

  // Upload to presigned URL
  onProgress?.('uploading');
  await uploadToPresignedUrl(
    prepareResponse.uploadUrl,
    file,
    file.type || 'application/octet-stream',
  );

  // Confirm upload
  onProgress?.('confirming');
  const confirmResponse = await confirmUpload(prepareResponse.patientFileId, {
    fileObjectId: prepareResponse.fileObjectId,
    sha256,
  });

  return confirmResponse.patientFileId;
}
