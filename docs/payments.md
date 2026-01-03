# Payments MVP (Mercado Pago)

## Overview
- Provider: Mercado Pago (Checkout Pro URL).
- TTL: 10 minutos desde la creación del pago.
- Unidades monetarias: `amountCents` (centavos), moneda `ARS` por defecto.
- Appointment: se crea en `pending_payment` y pasa a `confirmed` solo por webhook.
- Emergencia (queue): el doctor acepta para habilitar pago; el paciente inicia el checkout; el pago debe estar `paid` antes de iniciar la consulta.

## Estados

### PaymentStatus
- `pending`: creado, checkout activo.
- `paid`: aprobado en Mercado Pago.
- `failed`: rechazado/cancelado.
- `expired`: vencido.
- `refunded`: reembolsado (reservado para futuro).

### AppointmentStatus
- `pending_payment`: esperando pago.
- `confirmed`: pago confirmado.
- `scheduled`: legacy (tratado como confirmado en consultas/queue).
- `cancelled`: cancelado o expirado.

### ConsultationQueuePaymentStatus
- `not_started`: sin pago habilitado.
- `pending`: checkout activo.
- `paid`: pago confirmado.
- `failed`: pago rechazado/cancelado.
- `expired`: pago vencido.

## Flujos

### Appointment (programado)
1) `POST /api/v1/appointments`
   - valida slot y crea `Appointment` con `pending_payment`.
   - crea `Payment` `pending` (TTL 10 min) y devuelve `checkoutUrl`.
2) Webhook MP (aprobado) -> `Payment.paid`, `Appointment.confirmed`.
3) Expire-on-read: si `pending_payment` y `paymentExpiresAt < now`, `Appointment.cancelled` y `Payment.expired`.

### Emergencia (queue)
1) `POST /api/v1/consultations/queue` (walk-in)
   - crea queueItem con `paymentStatus=not_started`.
2) `POST /api/v1/consultations/queue/:queueItemId/accept` (doctor)
   - cambia a `status=accepted` y `paymentStatus=pending` (TTL 10 min).
3) `POST /api/v1/consultations/queue/:queueItemId/payment` (patient)
   - crea `Payment` `pending` y devuelve `checkoutUrl`.
4) Webhook MP (aprobado) -> `paymentStatus=paid`.
5) `POST /api/v1/consultations/queue/:queueItemId/start`
   - requiere `paymentStatus=paid` si es emergencia.

## Webhooks
- Endpoint: `POST /api/v1/payments/webhooks/mercadopago`.
- Firma: `x-signature` + `x-request-id` (HMAC SHA-256 sobre `requestId + '.' + JSON.stringify(body)`).
- Siempre reconsulta `GET /v1/payments/:id` para mapear estado real.

## Idempotencia
- Header `Idempotency-Key` en creaciones de pago.
- Unicidad: `(patientUserId, idempotencyKey, kind)`.

## Observabilidad
- Logs con `traceId` y `actorId` por request.
- Prisma slow query log habilitado por `SLOW_QUERY_MS`.
