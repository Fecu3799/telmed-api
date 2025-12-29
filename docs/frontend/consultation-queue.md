# Consultation Queue / Waiting Room (API Contract)

## Overview
- Queue: sala de espera previa a la teleconsulta.
- Consultation: registro clinico asociado a un appointment.
- Queue existe para coordinar el ingreso; consultation existe para el registro clinico.

## State machine
- queued -> accepted -> in_progress -> finalized
- queued -> rejected
- queued -> cancelled
- queued -> expired

## Roles & permissions
- patient: crear queue, cancelar queue propia.
- doctor: crear queue (si corresponde), aceptar/rechazar, cancelar, iniciar, finalizar.
- admin: override total.

## Business rules
1) Un solo queue activo por appointmentId si existe, o por (patientUserId, doctorUserId) si no hay appointment (urgencia).
2) Si existe appointmentId: permitir queue solo dentro de [startAt - 15min, startAt + 15min].
3) TTL queue: expiresAt = queuedAt + 15min (default, configurable a futuro).
4) Doctor/admin pueden aceptar/rechazar; patient puede cancelar; doctor puede cancelar si es el owner; admin override total.
5) Auditoria minima: createdBy, acceptedBy, cancelledBy; reason obligatorio en acciones manuales (reject/cancel por admin/doctor).
6) Expiracion: si status=queued y now >= expiresAt, el item se marca como expired (persistente) al leer.
   - accept/reject permiten estado expired; cancel solo permite status=queued.
7) Ventana por appointmentId: si existe, validar `now` dentro de `[startAt - 15min, startAt + 15min]`.
   - fuera de ventana => 422 con detail \"Waiting room not available for this appointment time\".

## Queue ordering
1) accepted
2) queued appointments on-time (now dentro de [startAt - 15min, startAt + 15min])
3) queued appointments early (now < startAt - 15min)
4) queued walk-ins (sin appointmentId)
5) expired
- Dentro de appointments: startAt asc, luego queuedAt asc.
- Walk-ins: queuedAt asc.
- El doctor puede aceptar manualmente cualquiera, pero el orden por defecto debe ser consistente.

## Waiting-room window (appointment-linked)
- Si existe appointmentId: permitir crear queue solo si `now` esta en `[startAt - 15min, startAt + 15min]`.
- Fuera de ventana: responder 422 con `detail` claro (\"Waiting room not available for this appointment time\").
- Esta ventana prevalece sobre el TTL cuando hay appointmentId.

## Appointment after window
- Estado propuesto: `missed` / `no_show` / `expired` (pendiente de decision).
- Acciones: doctor/admin puede habilitar excepcion o reprogramar.

## API Contract (v1)

### POST /api/v1/consultations/queue
Status: 201 (creado), 409 si ya existe queue activa, 422 si fuera de ventana.
Request:
```json
{
  "appointmentId": "e9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a",
  "doctorUserId": "d9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a",
  "patientUserId": "2b3c5f7a-9c2a-4c1e-8e9f-123456789abc"
}
```
Notas:
- `appointmentId` es opcional para consultas de urgencia.
- Si `appointmentId` existe, se valida la ventana ±15min.
Response 201:
```json
{
  "id": "q9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a",
  "status": "queued",
  "queuedAt": "2025-01-05T13:50:00.000Z",
  "expiresAt": "2025-01-05T14:05:00.000Z",
  "appointmentId": "e9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a",
  "doctorUserId": "d9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a",
  "patientUserId": "2b3c5f7a-9c2a-4c1e-8e9f-123456789abc",
  "createdBy": "2b3c5f7a-9c2a-4c1e-8e9f-123456789abc"
}
```

### POST /api/v1/consultations/queue/:queueId/accept
Status: 200, 409 si estado invalido.
Response 200:
```json
{
  "id": "q9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a",
  "status": "accepted",
  "queuedAt": "2025-01-05T13:50:00.000Z",
  "expiresAt": "2025-01-05T14:05:00.000Z",
  "doctorUserId": "d9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a",
  "patientUserId": "2b3c5f7a-9c2a-4c1e-8e9f-123456789abc",
  "createdBy": "2b3c5f7a-9c2a-4c1e-8e9f-123456789abc",
  "acceptedAt": "2025-01-05T13:52:00.000Z",
  "acceptedBy": "d9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a"
}
```

### POST /api/v1/consultations/queue/:queueId/reject
Status: 200, 409 si estado invalido.
Request:
```json
{ "reason": "No disponible" }
```
Response 200:
```json
{
  "id": "q9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a",
  "status": "rejected",
  "queuedAt": "2025-01-05T13:50:00.000Z",
  "expiresAt": "2025-01-05T14:05:00.000Z",
  "doctorUserId": "d9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a",
  "patientUserId": "2b3c5f7a-9c2a-4c1e-8e9f-123456789abc",
  "createdBy": "2b3c5f7a-9c2a-4c1e-8e9f-123456789abc",
  "rejectedAt": "2025-01-05T13:53:00.000Z",
  "rejectedBy": "d9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a",
  "reason": "No disponible"
}
```

### POST /api/v1/consultations/queue/:queueId/cancel
Status: 200, 409 si estado invalido.
Request:
```json
{ "reason": "No puedo asistir" }
```
Response 200:
```json
{
  "id": "q9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a",
  "status": "cancelled",
  "queuedAt": "2025-01-05T13:50:00.000Z",
  "expiresAt": "2025-01-05T14:05:00.000Z",
  "doctorUserId": "d9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a",
  "patientUserId": "2b3c5f7a-9c2a-4c1e-8e9f-123456789abc",
  "createdBy": "2b3c5f7a-9c2a-4c1e-8e9f-123456789abc",
  "cancelledAt": "2025-01-05T13:54:00.000Z",
  "cancelledBy": "2b3c5f7a-9c2a-4c1e-8e9f-123456789abc",
  "reason": "No puedo asistir"
}
```

### POST /api/v1/consultations/from-queue/:queueId/start
Status: 201.
Response 201:
```json
{
  "id": "c9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a",
  "status": "in_progress",
  "startedAt": "2025-01-05T14:00:00.000Z",
  "doctorUserId": "d9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a",
  "patientUserId": "2b3c5f7a-9c2a-4c1e-8e9f-123456789abc",
  "appointmentId": "e9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a"
}
```

### POST /api/v1/consultations/:id/finalize
Status: 200.
Request:
```json
{ "summary": "Resumen", "notes": "Notas" }
```
Response 200:
```json
{
  "id": "c9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a",
  "status": "finalized",
  "closedAt": "2025-01-05T14:30:00.000Z",
  "doctorUserId": "d9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a",
  "patientUserId": "2b3c5f7a-9c2a-4c1e-8e9f-123456789abc",
  "appointmentId": "e9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a"
}
```

## Error handling
- 401 Unauthorized
- 403 Forbidden
- 404 Not found (queue/consultation/appointment)
- 409 Conflict (queue activa o estado invalido)
- 422 Validation failed (fuera de ventana, payload invalido)

Problem Details example:
```json
{
  "type": "about:blank",
  "title": "UnprocessableEntity",
  "status": 422,
  "detail": "Validation failed",
  "instance": "/api/v1/consultations/queue",
  "errors": {
    "appointmentId": ["Invalid uuid"]
  }
}
```

## Happy path UI
Patient crea queue, doctor acepta, doctor inicia, doctor finaliza. Admin puede intervenir en cualquier paso.
### GET /api/v1/consultations/queue
Status: 200.
Response 200:
```json
[
  {
    "id": "q9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a",
    "status": "queued",
    "queuedAt": "2025-01-05T13:50:00.000Z",
    "expiresAt": "2025-01-05T14:05:00.000Z",
    "appointmentId": "e9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a",
    "doctorUserId": "d9b7f38c-0c1e-4c5d-8f9f-0c0e4c7e1a1a",
    "patientUserId": "2b3c5f7a-9c2a-4c1e-8e9f-123456789abc",
    "createdBy": "2b3c5f7a-9c2a-4c1e-8e9f-123456789abc"
  }
]
```
