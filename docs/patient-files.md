# Patient Files API

## Overview

The Patient Files module provides a centralized file library for patients. Files can be uploaded by patients or doctors (who have consulted with the patient), and are stored securely with presigned URLs for upload/download operations.

### Key Features

- **Presigned URL Flow**: Prepare → Upload → Confirm workflow
- **SHA-256 Checksums**: Optional but recommended for deduplication and integrity
- **Complete Audit Trail**: All file operations are logged (upload, download, delete)
- **Role-Based Access**: Patients access their own files; doctors access files of patients they've consulted with
- **Soft Delete**: Files are marked as deleted, not physically removed
- **Status Machine**: `pending_upload` → `ready` → `deleted` (or `failed`)

## Base & Auth

- Base: `/api/v1`
- Auth: Bearer JWT (patient/doctor)
- Admin: FORBIDDEN (no access to patient file content)

## Endpoints

### Patient Routes (Self)

All routes under `/patients/me/files/*` are for patients accessing their own files.

#### POST `/patients/me/files/prepare`

Prepare a file upload. Creates a `PatientFile` in `pending_upload` status and returns a presigned upload URL.

**Request Body:**
```json
{
  "originalName": "informe_laboratorio.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 245760,
  "category": "lab",
  "notes": "Análisis de sangre completo",
  "relatedConsultationId": "c9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a",
  "sha256": "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
}
```

**Response:**
```json
{
  "patientFileId": "pf9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a",
  "fileObjectId": "f9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a",
  "uploadUrl": "https://minio.local/presigned-upload-url",
  "expiresAt": "2025-01-05T14:05:00.000Z"
}
```

**Validations:**
- MIME type must be in allowlist: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`
- File size: max 20MB for patients, 100MB for doctors
- SHA-256: 64 hex characters if provided
- `relatedConsultationId`: must belong to the patient (and doctor if actor is doctor)

**Errors:**
- `409 Conflict`: File with same SHA-256 already exists
- `422 Unprocessable Entity`: Invalid MIME type, file size, or SHA-256 format

#### POST `/patients/me/files/:patientFileId/confirm`

Confirm that file upload is complete. Marks the `PatientFile` as `ready`.

**Request Body:**
```json
{
  "fileObjectId": "f9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a",
  "sha256": "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
}
```

**Response:**
```json
{
  "patientFileId": "pf9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a"
}
```

**Validations:**
- `PatientFile` must be in `pending_upload` status
- `fileObjectId` must match the one from prepare
- If SHA-256 was provided in prepare, it must match in confirm

**Errors:**
- `409 Conflict`: File is not in pending_upload status, fileObjectId mismatch, or SHA-256 mismatch

#### GET `/patients/me/files`

List patient files with pagination and optional filters.

**Query Parameters:**
- `cursor`: Pagination cursor (optional)
- `limit`: Number of items per page (1-100, default: 50)
- `category`: Filter by category (`lab`, `image`, `prescription`, `other`)
- `relatedConsultationId`: Filter by related consultation ID
- `q`: Search by original name (case-insensitive partial match)
- `status`: Filter by status (default: `ready`)

**Response:**
```json
{
  "items": [
    {
      "id": "pf9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a",
      "status": "ready",
      "originalName": "informe_laboratorio.pdf",
      "mimeType": "application/pdf",
      "sizeBytes": 245760,
      "category": "lab",
      "notes": "Análisis de sangre completo",
      "uploadedByUserId": "u9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a",
      "uploadedByRole": "doctor",
      "relatedConsultationId": "c9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a",
      "createdAt": "2025-01-05T14:00:00.000Z",
      "updatedAt": "2025-01-05T14:05:00.000Z"
    }
  ],
  "pageInfo": {
    "hasNextPage": false,
    "endCursor": null
  }
}
```

#### GET `/patients/me/files/:patientFileId`

Get metadata for a specific patient file (no download URL).

**Response:**
Same structure as items in list response.

#### GET `/patients/me/files/:patientFileId/download`

Get a presigned download URL for a patient file. File must be in `ready` status.

**Response:**
```json
{
  "downloadUrl": "https://minio.local/presigned-download-url",
  "expiresAt": "2025-01-05T14:05:00.000Z"
}
```

**Errors:**
- `404 Not Found`: File is not in `ready` status

#### DELETE `/patients/me/files/:patientFileId`

Soft delete a patient file (marks as `deleted` status).

**Response:**
```json
{
  "patientFileId": "pf9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a"
}
```

### Doctor Routes (On Behalf of Patient)

All routes under `/patients/:patientId/files/*` are for doctors accessing files of patients they've consulted with.

**Access Control:**
- Doctor must have at least one `Consultation` (any status) with the patient
- Admin: FORBIDDEN

All endpoints have the same request/response structure as patient routes, but:
- Use `:patientId` path parameter (patient's `userId`, not `Patient.id`)
- Doctor role required
- Access is verified by `PatientFilesAccessService`

Endpoints:
- `POST /patients/:patientId/files/prepare`
- `POST /patients/:patientId/files/:patientFileId/confirm`
- `GET /patients/:patientId/files`
- `GET /patients/:patientId/files/:patientFileId`
- `GET /patients/:patientId/files/:patientFileId/download`
- `DELETE /patients/:patientId/files/:patientFileId`

## File Upload Flow

1. **Prepare**: Call `POST /patients/me/files/prepare` (or doctor route)
   - Returns `uploadUrl` (presigned PUT URL, expires in 300s by default)
   - Creates `FileObject` and `PatientFile` in `pending_upload` status

2. **Upload**: Use the `uploadUrl` to PUT the file content directly to storage
   - Content-Type and Content-Length are already set in the presigned URL
   - Client calculates SHA-256 during upload (optional but recommended)

3. **Confirm**: Call `POST /patients/me/files/:patientFileId/confirm`
   - Provide `fileObjectId` (from prepare response)
   - Optionally provide `sha256` (must match if provided in prepare)
   - Marks `PatientFile` as `ready`

## SHA-256 Checksums

SHA-256 checksums are optional but recommended:
- **Format**: 64 hexadecimal characters (case-insensitive)
- **Purpose**: Deduplication and integrity verification
- **Flow**:
  - Can be provided in `prepare` (recommended)
  - Must be provided in `confirm` if provided in `prepare`
  - If provided in `prepare`, will be validated in `confirm`
- **Deduplication**: If a file with the same `patientId` + `sha256` exists in `ready` status, `prepare` returns `409 Conflict`

## File Categories

- `lab`: Laboratory results
- `image`: Medical images (X-rays, scans, etc.)
- `prescription`: Prescriptions
- `other`: Other documents

## Status Machine

- `pending_upload`: File upload prepared, waiting for confirmation
- `ready`: File uploaded and confirmed, available for download
- `failed`: Upload failed (not currently used, reserved for future)
- `deleted`: File soft-deleted (not available for download)

## Audit Logging

All file operations are logged in the audit log:

- **Upload Prepared**: `action=WRITE`, `event=upload_prepared`
- **Upload Confirmed**: `action=WRITE`, `event=upload_confirmed`
- **Download Requested**: `action=READ`, `event=download_requested` (includes IP and User-Agent)
- **List Files**: `action=READ`, `event=list_files`
- **Get File**: `action=READ`, `event=get_file`
- **Delete**: `action=WRITE`, `event=deleted`

Metadata logged (no file content):
- MIME type, size, SHA-256, category, relatedConsultationId
- Actor ID, role, trace ID, IP, User-Agent

## Permissions

### Patient
- Can LIST/GET/DOWNLOAD/UPLOAD their own files
- Cannot access files of other patients

### Doctor
- Can LIST/GET/DOWNLOAD/UPLOAD files of patients they have consulted with
- Access requires at least one `Consultation` (any status) between doctor and patient
- During an `in_progress` consultation, can set `relatedConsultationId`

### Admin
- FORBIDDEN (no access to patient file content)

## Configuration

Environment variables:
- `PATIENT_FILE_MAX_BYTES_PATIENT`: Max file size for patients (default: 20MB)
- `PATIENT_FILE_MAX_BYTES_DOCTOR`: Max file size for doctors (default: 100MB)
- `PRESIGN_TTL_SECONDS`: Presigned URL TTL (default: 300s)

## Future Extensions

Potential enhancements (not implemented):
- Antivirus scanning
- File retention policies
- Batch operations
- File versioning
- Hard delete (permanent removal)
