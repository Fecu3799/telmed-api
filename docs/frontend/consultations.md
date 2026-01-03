# Consultations Live (API Contract)

## Base & Auth
- Base: `/api/v1`
- Auth: Bearer JWT (doctor/patient). Admin solo lectura operativa en `GET /consultations/:id`.

## Endpoints HTTP

### GET /consultations/:id
- Doctor/patient: devuelve datos completos (status, queueItem, videoProvider/roomName, etc).
- Admin: devuelve solo estado operativo (sin roomName, mensajes ni archivos).

### POST /consultations/:id/livekit-token
- Roles: doctor/patient.
- Requiere `consultation.status = in_progress`.
- Respuesta: `{ token, roomName, livekitUrl }`.

### POST /consultations/:id/close
- Roles: doctor/admin.
- Cierra la consulta y emite `consultation.closed` por WS.

### GET /consultations/:id/messages?cursor=&limit=
- Roles: doctor/patient.
- Paginación por cursor (createdAt + id).
- Respuesta: `{ items, pageInfo: { nextCursor } }`.

### POST /consultations/:id/files/prepare
- Roles: doctor/patient.
- Body: `{ filename, mimeType, sizeBytes, sha256? }`.
- Respuesta: `{ fileId, uploadUrl, bucket, objectKey }`.

### POST /consultations/:id/files/confirm
- Roles: doctor/patient.
- Body: `{ fileId }`.
- Crea un `ConsultationMessage` con `kind=file`.

### GET /consultations/:id/files/:fileId/download
- Roles: doctor/patient.
- Respuesta: `{ downloadUrl }` (presigned).

## WebSocket (Socket.IO)
Namespace: `/consultations`

### consultation.join
Payload: `{ consultationId }`
ACK: `{ ok:true, serverTime, consultationStatus }`

### presence.ping
Payload: `{ consultationId }`
ACK opcional: `{ ok:true }`
Server emit: `presence.state { consultationId, onlineUserIds }`

### chat.send
Payload: `{ consultationId, clientMsgId?, text }`
ACK: `{ ok:true, clientMsgId, message }`
Server emit: `chat.message_created { message }`

### chat.delivered
Payload: `{ consultationId, messageId }`
ACK: `{ ok:true }`
Server emit: `chat.message_delivered { messageId, deliveredAt }`

### consultation.closed
Server emit: `{ consultationId, closedAt }`

## Reglas clave
- Solo doctor/patient pueden usar WS y endpoints de mensajes/archivos/token.
- Admin no recibe tokens ni contenidos.
- `livekit-token` solo cuando la consulta está `in_progress`.
- Presencia: ping cada ~10s; TTL server 30s.
- Archivos: subida por presigned URL; no se guarda URL en DB.

## Errores
Formato Problem Details con `status` 401/403/404/409/422 según corresponda.
