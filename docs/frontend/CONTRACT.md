# TelMed Frontend Contract (Referencia Única)

Este documento consolida el contrato y reglas que el frontend debe respetar para integrarse con TelMed-API (v1).
Aplica a: scheduling (availability/appointments), waiting room (consultation-queue), consultas en vivo (LiveKit + chat + files),
pagos (Mercado Pago), y convenciones transversales (auth, errores, paginación, fechas, observabilidad).

---

## 1) Base del API, versionado y roles

### Base
- Base URL: `/api/v1`

### Roles
- `patient`
- `doctor`
- `admin`

### Principio clave: contrato estable `actor`
- El backend garantiza `actor = { id: UUID, role }`.
- El frontend **no debe depender de claims específicos** del JWT (compatibilidad futura con OIDC).
- Autorización: roles + ownership basados en actor.

---

## 2) Auth (estado actual + futuro)

### Estado actual (JWT local)
- Auth: Bearer JWT (access token).
- Refresh token + sessions en DB (rotación).
- Logout revoca session.
- Los endpoints de negocio usan `actor` inyectado por el guard.

### Futuro (OIDC: Google/Apple/Microsoft)
- Se validará JWT del IdP (JWKS) y se mapeará identidad externa a `userId`.
- `actor` sigue siendo la única fuente de autorización.
- Reglas de negocio y endpoints **no cambian**.

### Reglas frontend
- Usar `Authorization: Bearer <accessToken>`.
- Evitar lógica basada en claims (salvo expiración básica si se usa).

---

## 3) Error handling (Problem Details)

### Status esperables
- `401` Unauthorized
- `403` Forbidden
- `404` Not found
- `409` Conflict (estado inválido / resource ya existente)
- `422` Validation failed (payload inválido, fuera de ventana, etc.)

### Formato (Problem Details)
Ejemplo:
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

Reglas UI

Mostrar detail como mensaje principal.

Si existe errors (campo → lista), renderizar por campo.

En 422 por reglas de negocio (ej. ventana sala), mostrar texto claro (ej: "Waiting room not available for this appointment time").

4) Observabilidad / trazabilidad (frontend)
TraceId

El cliente puede enviar X-Trace-Id.

El servidor siempre devuelve traceId en la respuesta.

Recomendación: generar un UUID por “flujo” (ej. login → queue → pago → start) para agrupar debugging.

Audit (MVP)

No hay endpoints públicos de auditoría (se usa internamente/operaciones).

UI admin: idea futura de filtrar por traceId para seguir un flujo completo.

5) Convenciones de fechas y horas (ADR-0001)
Regla general

La API usa ISO-8601 UTC con Z para timestamps (startAt, endAt, queuedAt, etc).

En UI se puede trabajar con fechas locales, pero al llamar la API hay que convertir a UTC ISO.

Availability: GET /api/v1/doctors/:doctorUserId/availability

UI selecciona rango por fechas YYYY-MM-DD.

Request usa query params ISO UTC: from, to (ej. 2025-01-05T00:00:00.000Z).

Response: slots con startAt y endAt en ISO UTC Z.

Appointments: POST /api/v1/appointments

startAt es ISO UTC y debe coincidir con un slot.

Listados de appointments

from y to ISO UTC obligatorios.

UX

Los errores 422 por leadTime/horizon/rango deben mostrarse claramente.

6) Paginación (ADR-0002)
Respuesta estándar (listados)
{ "items": [...], "pageInfo": { "page": 1, "limit": 20, "total": 123, "hasNextPage": true, "hasPrevPage": false } }

Reglas

page es 1-based.

skip = (page - 1) * limit (conceptual; el front solo usa page/limit).

total permite paginación sin llamadas extra.

Excepción: mensajes por cursor

Mensajes usan paginación por cursor (ver sección 10).

7) Precondición de perfiles (ADR-0003)

Para operar disponibilidad y turnos se exige:

DoctorProfile existente y activo para el médico.

PatientProfile existente para el paciente.

Consecuencia frontend:

Si falta el perfil, la API responde 404 (Doctor not found / Patient not found).

El frontend debe crear/completar perfil antes de reservar/operar.

8) Scheduling (Frontend API Contract)
Reglas de negocio

slotMinutes = 20 (hoy fijo; futuro configurable).

leadTime = 24h.

horizon = 60d.

No solapamiento del doctor en la misma franja: 409 Conflict.

PatientProfile requerido antes de reservar.

Happy paths

Reservar turno (patient): POST /appointments { doctorUserId, startAt }.

Reservar turno (admin): POST /appointments { doctorUserId, patientUserId, startAt }.

Listar turnos:

patient: GET /patients/me/appointments

doctor: GET /doctors/me/appointments

admin: GET /admin/appointments

Cancelar turno: POST /appointments/:id/cancel { reason } (ownership o admin override).

Recomendaciones UI

Al crear reglas/ventanas horarias, preferir múltiplos de 20 minutos.

En queries de disponibilidad, usar timestamps con hora (no solo fecha) para evitar fallas por leadTime.

9) Consultation Queue / Waiting Room (ADR-0004 + reglas unificadas)
Objetivo

Separar:

Appointment: agenda.

Consultation: registro clínico asociado a appointment.

ConsultationQueueItem: sala de espera y coordinación de ingreso.

State machine

queued -> accepted -> in_progress -> closed

queued -> rejected

queued -> cancelled

queued -> expired

Roles & permisos

patient: crear queue, cancelar queue propia.

doctor: aceptar/rechazar, cancelar, iniciar, cerrar consulta.

admin: override total.

Reglas clave (unificadas)

Un solo queue activo por appointmentId si existe, o por (patientUserId, doctorUserId) si no hay appointment (urgencia).

Si existe appointmentId: permitir queue solo dentro de ventana now ∈ [startAt - 15min, startAt + 15min].

Fuera de ventana: 422 con detail "Waiting room not available for this appointment time".

TTL queue (default): expiresAt = queuedAt + 15min (configurable a futuro).

Doctor/admin: aceptar/rechazar; patient: cancelar; doctor: puede cancelar si owner; admin override.

Auditoría mínima: createdBy, acceptedBy, cancelledBy; reason obligatorio en acciones manuales (reject/cancel por admin/doctor).

entryType derivado por backend:

con appointmentId ⇒ appointment

sin appointmentId ⇒ emergency

Si entryType=appointment ⇒ paymentStatus=not_required.

Si entryType=emergency ⇒ reason obligatorio.

Expire-on-read: si status=queued y now >= expiresAt, se marca expired persistente al leer.

accept/reject pueden ocurrir aunque esté expired (según backend).

cancel solo permitido si status=queued.

Emergencias: paymentStatus debe ser paid para aceptar/iniciar (ver pagos).

Ordering (por defecto)

Orden general (conceptual):

accepted

queued appointments on-time (dentro de ventana)

queued appointments early (antes de ventana)

queued walk-ins (sin appointmentId)

expired

Dentro de appointments: appointment.startAt asc, luego queuedAt asc.

Walk-ins: queuedAt asc.

Doctor puede aceptar manualmente cualquiera (override).

UI Spec (mínimo)

Patient: mostrar botón “Entrar a sala” solo dentro de ventana ±15 min para appointment.

Fuera de ventana: ocultar botón y mostrar estado (muy temprano / demasiado tarde).

Emergencia: botón “Pagar” solo si status=accepted y paymentStatus=pending.

9.1) Queue API Contract (v1)
POST /api/v1/consultations/queue

201 creado, 409 si ya existe queue activa, 422 fuera de ventana.
Request:

{
  "appointmentId": "uuid-opcional",
  "doctorUserId": "uuid",
  "patientUserId": "uuid",
  "reason": "obligatorio si es emergencia"
}

POST /api/v1/consultations/queue/:queueItemId/accept

200, 409 estado inválido.

Solo aplica a entryType=emergency.

Cambia paymentStatus a pending y setea paymentExpiresAt (TTL 10 min).

POST /api/v1/consultations/queue/:queueItemId/reject

200, 409 estado inválido.
Request:

{ "reason": "No disponible" }

POST /api/v1/consultations/queue/:queueItemId/cancel

200, 409 estado inválido.
Request:

{ "reason": "No puedo asistir" }

POST /api/v1/consultations/queue/:queueItemId/payment

200, 409 estado inválido.

Solo entryType=emergency y requiere status=accepted y paymentStatus=pending.
Response:

{ "checkoutUrl": "https://...", "expiresAt": "ISO", "status": "pending" }

POST /api/v1/consultations/queue/:queueItemId/start

201
Response:

{ "queueItem": {...}, "consultation": {...}, "videoUrl": "..." }

POST /api/v1/consultations/:id/close

Cierre operativo (para emitir consultation.closed por WS).

GET /api/v1/consultations/queue

200 lista (formato definido por backend; actualmente puede ser array simple o con items/pageInfo según endpoint real).

10) Consultations Live (LiveKit + Chat + Files)
Base & Auth

Base: /api/v1

Auth: Bearer JWT (doctor/patient).

Admin: solo lectura operativa en GET /consultations/:id (sin roomName, mensajes ni archivos).

Endpoints HTTP
GET /consultations/:id

Doctor/patient: datos completos (status, queueItem, videoProvider/roomName, etc).

Admin: solo estado operativo (sin contenidos).

POST /consultations/:id/livekit-token

Roles: doctor/patient.

Requiere consultation.status = in_progress.

Respuesta: { token, roomName, livekitUrl }.

POST /consultations/:id/close

Roles: doctor/admin.

Cierra consulta y emite consultation.closed por WS.

GET /consultations/:id/messages?cursor=&limit=

Roles: doctor/patient.

Paginación por cursor (createdAt + id).

Respuesta: { items, pageInfo: { nextCursor } }.

POST /consultations/:id/files/prepare

Roles: doctor/patient.
Body: { filename, mimeType, sizeBytes, sha256? }

Respuesta: { fileId, uploadUrl, bucket, objectKey }.

POST /consultations/:id/files/confirm

Roles: doctor/patient.
Body: { fileId }

Crea un ConsultationMessage con kind=file.

GET /consultations/:id/files/:fileId/download

Roles: doctor/patient.

Respuesta: { downloadUrl } (presigned).

WebSocket (Socket.IO)

Namespace: /consultations

consultation.join

Payload: { consultationId }
ACK: { ok:true, serverTime, consultationStatus }

presence.ping

Payload: { consultationId }

Server emit: presence.state { consultationId, onlineUserIds }

Recomendación: ping ~10s; TTL server 30s.

chat.send

Payload: { consultationId, clientMsgId?, text }
ACK: { ok:true, clientMsgId, message }
Server emit: chat.message_created { message }

chat.delivered

Payload: { consultationId, messageId }
ACK: { ok:true }
Server emit: chat.message_delivered { messageId, deliveredAt }

consultation.closed

Server emit: { consultationId, closedAt }

Reglas clave

Solo doctor/patient usan WS y endpoints de mensajes/archivos/token.

Admin no recibe tokens ni contenidos.

livekit-token solo cuando status=in_progress.

Archivos: subida por presigned; no se guarda URL en DB.

11) Payments MVP (Mercado Pago)
Overview

Provider: Mercado Pago (Checkout Pro URL).

TTL: 10 minutos.

Dinero: grossAmountCents + platformFeeCents = totalChargedCents (centavos), moneda ARS por defecto.

Estados
PaymentStatus

pending, paid, failed, expired, refunded (futuro)

AppointmentStatus

pending_payment → confirmed solo por webhook.

scheduled legacy (tratado como confirmado en consultas/queue).

cancelled

ConsultationQueuePaymentStatus

not_started, pending, paid, failed, expired

Flujos
Appointment (programado)

POST /api/v1/appointments:

crea Appointment pending_payment

crea Payment pending (TTL 10m) y devuelve checkoutUrl

Webhook MP: Payment.paid, Appointment.confirmed

Expire-on-read: si venció, Appointment.cancelled y Payment.expired

Emergencia (queue)

POST /api/v1/consultations/queue (walk-in): paymentStatus=not_started

POST /api/v1/consultations/queue/:id/accept (doctor):

status=accepted, paymentStatus=pending, TTL 10m

POST /api/v1/consultations/queue/:id/payment (patient): crea Payment y devuelve checkoutUrl

Webhook MP: paymentStatus=paid

POST /api/v1/consultations/queue/:id/start: requiere paid si es emergencia

Webhook Mercado Pago

POST /api/v1/payments/webhooks/mercadopago

Firma: x-signature + x-request-id (HMAC SHA-256 sobre requestId + '.' + JSON.stringify(body))

Reconsulta GET /v1/payments/:id para mapear estado real.

Idempotencia

Header Idempotency-Key en creaciones de pago.

Unicidad: (patientUserId, idempotencyKey, kind).

12) Decisiones técnicas relevantes para el frontend (para no romper contratos)

dinero: priceCents es interno (Int). UI puede mostrar pesos sin decimales.

displayName vive en User (evitar duplicación en perfiles).

PostGIS/Unsupported: migraciones SQL manuales (no depende del front, pero impacta datos).

seed admin: npm run db:seed con SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD (idempotente).

PrismaClient + adapter-pg requerido en scripts (nota backend; evitar ejemplos de new PrismaClient() directo).

13) CI / env (referencia)

Secrets en GitHub Actions:

JWT_ACCESS_SECRET

JWT_REFRESH_SECRET

Variables internas (CI):

DATABASE_URL, DATABASE_URL_TEST, SHADOW_DATABASE_URL

REDIS_URL, APP_ENV, NODE_ENV, THROTTLE_ENABLED
GEO_GEOCODER_PROVIDER, GEO_GEOCODER_TIMEOUT_MS, GEO_GEOCODER_USER_AGENT
GEO_EMERGENCY_DAILY_LIMIT, GEO_EMERGENCY_MONTHLY_LIMIT
