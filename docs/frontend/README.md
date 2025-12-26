# Frontend API Contract (Scheduling)

## Base & Auth
- Base URL: `/api/v1`
- Auth: Bearer tokens (JWT access)
- Roles:
  - patient
  - doctor
  - admin

## Date/Time formats
- Availability GET `/doctors/:doctorUserId/availability`:
  - UI range in dates `YYYY-MM-DD`.
  - Request uses ISO UTC for query params: `from` and `to` (example: `2025-01-05T00:00:00.000Z`).
  - Response slots: `startAt` and `endAt` are ISO UTC with `Z`.
- Appointments POST `/appointments`:
  - `startAt` is ISO UTC and must match a slot from availability.
- Appointments list endpoints:
  - `from` and `to` are ISO UTC and required.

## Business rules
- `slotMinutes = 60` (fixed today; configurable in future).
- `leadTime = 24h`.
- `horizon = 60d`.
- No overlap for a doctor at the same time: 409 Conflict.
- PatientProfile required before reserving an appointment.

## Happy paths
- Reservar turno (patient): POST `/appointments` with `{ doctorUserId, startAt }`.
- Reservar turno (admin): POST `/appointments` with `{ doctorUserId, patientUserId, startAt }`.
- Listar turnos:
  - patient: GET `/patients/me/appointments`
  - doctor: GET `/doctors/me/appointments`
  - admin: GET `/admin/appointments`
- Cancelar turno:
  - POST `/appointments/:id/cancel`
  - patient/doctor solo si es propio, admin siempre.

## Error handling
- 401 Unauthorized
- 403 Forbidden
- 404 Doctor not found
- 404 Patient not found
- 422 Validation failed
- 409 Conflict (overlap)

Problem Details example:
```json
{
  "type": "about:blank",
  "title": "UnprocessableEntity",
  "status": 422,
  "detail": "Validation failed",
  "instance": "/api/v1/appointments",
  "errors": {
    "startAt": ["Invalid datetime"]
  }
}
```

## Examples

### PUT /patients/me/profile
Request:
```json
{
  "firstName": "Juan",
  "lastName": "Perez",
  "phone": "+5491100000000"
}
```
Response 200:
```json
{
  "userId": "2b3c5f7a-9c2a-4c1e-8e9f-123456789abc",
  "firstName": "Juan",
  "lastName": "Perez",
  "phone": "+5491100000000",
  "createdAt": "2025-01-01T12:00:00.000Z",
  "updatedAt": "2025-01-01T12:00:00.000Z"
}
```

### PUT /doctors/me/profile
Request:
```json
{
  "firstName": "Ana",
  "lastName": "Gomez",
  "bio": "Cardiologa",
  "priceCents": 120000,
  "currency": "ARS"
}
```
Response 200:
```json
{
  "userId": "d9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a",
  "firstName": "Ana",
  "lastName": "Gomez",
  "bio": "Cardiologa",
  "priceCents": 120000,
  "currency": "ARS",
  "isActive": true,
  "verificationStatus": "unverified",
  "location": null,
  "createdAt": "2025-01-01T12:00:00.000Z",
  "updatedAt": "2025-01-01T12:00:00.000Z"
}
```

### PUT /doctors/me/availability-rules
Request:
```json
{
  "rules": [
    { "dayOfWeek": 1, "startTime": "09:00", "endTime": "12:00", "isActive": true },
    { "dayOfWeek": 3, "startTime": "14:00", "endTime": "18:00", "isActive": true }
  ]
}
```
Response 200:
```json
[
  {
    "id": "b9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a",
    "dayOfWeek": 1,
    "startTime": "09:00",
    "endTime": "12:00",
    "isActive": true
  }
]
```

### POST /doctors/me/availability-exceptions (closed)
Request:
```json
{ "date": "2025-01-15", "type": "closed" }
```
Response 200:
```json
{
  "id": "c9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a",
  "date": "2025-01-15",
  "type": "closed"
}
```

### POST /doctors/me/availability-exceptions (custom)
Request:
```json
{
  "date": "2025-01-15",
  "type": "custom",
  "customWindows": [
    { "startTime": "09:00", "endTime": "12:00" },
    { "startTime": "14:00", "endTime": "17:00" }
  ]
}
```
Response 200:
```json
{
  "id": "c9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1b",
  "date": "2025-01-15",
  "type": "custom",
  "customWindows": [
    { "startTime": "09:00", "endTime": "12:00" },
    { "startTime": "14:00", "endTime": "17:00" }
  ]
}
```

### GET /doctors/:doctorUserId/availability
Request:
```
GET /api/v1/doctors/d9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a/availability?from=2025-01-05T00:00:00.000Z&to=2025-01-06T00:00:00.000Z
```
Response 200:
```json
{
  "items": [
    { "startAt": "2025-01-05T09:00:00.000Z", "endAt": "2025-01-05T10:00:00.000Z" },
    { "startAt": "2025-01-05T10:00:00.000Z", "endAt": "2025-01-05T11:00:00.000Z" }
  ],
  "meta": {
    "timezone": "America/Argentina/Buenos_Aires",
    "slotDurationMinutes": 60,
    "leadTimeHours": 24,
    "horizonDays": 60
  }
}
```

### POST /appointments (patient)
Request:
```json
{ "doctorUserId": "d9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a", "startAt": "2025-01-05T09:00:00.000Z" }
```
Response 201:
```json
{
  "id": "e9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a",
  "doctorUserId": "d9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a",
  "patientUserId": "2b3c5f7a-9c2a-4c1e-8e9f-123456789abc",
  "startAt": "2025-01-05T09:00:00.000Z",
  "endAt": "2025-01-05T10:00:00.000Z",
  "status": "scheduled",
  "createdAt": "2025-01-01T12:00:00.000Z",
  "cancelledAt": null,
  "cancellationReason": null
}
```

### POST /appointments (admin)
Request:
```json
{
  "doctorUserId": "d9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a",
  "patientUserId": "2b3c5f7a-9c2a-4c1e-8e9f-123456789abc",
  "startAt": "2025-01-05T09:00:00.000Z"
}
```
Response 201: same as patient response.

### GET /patients/me/appointments
Request:
```
GET /api/v1/patients/me/appointments?from=2025-01-01T00:00:00.000Z&to=2025-01-31T23:59:59.000Z&page=1&limit=20
```
Response 200:
```json
{
  "items": [
    {
      "id": "e9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a",
      "doctorUserId": "d9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a",
      "patientUserId": "2b3c5f7a-9c2a-4c1e-8e9f-123456789abc",
      "startAt": "2025-01-05T09:00:00.000Z",
      "endAt": "2025-01-05T10:00:00.000Z",
      "status": "scheduled",
      "createdAt": "2025-01-01T12:00:00.000Z",
      "cancelledAt": null,
      "cancellationReason": null
    }
  ],
  "pageInfo": { "page": 1, "limit": 20, "total": 1, "hasNextPage": false, "hasPrevPage": false }
}
```

### GET /doctors/me/appointments
Same format as patient list.

### GET /admin/appointments
Request:
```
GET /api/v1/admin/appointments?from=2025-01-01T00:00:00.000Z&to=2025-01-31T23:59:59.000Z&doctorUserId=d9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a&patientUserId=2b3c5f7a-9c2a-4c1e-8e9f-123456789abc&page=1&limit=20
```
Response 200: same list format.

### POST /appointments/:id/cancel
Request:
```json
{ "reason": "No puedo asistir" }
```
Response 200:
```json
{
  "id": "e9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a",
  "doctorUserId": "d9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a",
  "patientUserId": "2b3c5f7a-9c2a-4c1e-8e9f-123456789abc",
  "startAt": "2025-01-05T09:00:00.000Z",
  "endAt": "2025-01-05T10:00:00.000Z",
  "status": "cancelled",
  "createdAt": "2025-01-01T12:00:00.000Z",
  "cancelledAt": "2025-01-02T12:00:00.000Z",
  "cancellationReason": "No puedo asistir"
}
```
