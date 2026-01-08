# Chat WebSocket Contract

## Namespace
**`/chats`**

## Autenticación

El cliente debe enviar el JWT access token en el handshake usando uno de estos métodos:

1. **Header `Authorization`** (recomendado):
   ```
   Authorization: Bearer <JWT_ACCESS_TOKEN>
   ```

2. **Auth object en handshake**:
   ```javascript
   {
     auth: {
       token: '<JWT_ACCESS_TOKEN>'  // O 'Bearer <JWT_ACCESS_TOKEN>'
     }
   }
   ```

El token se verifica y el `actor` (userId + role) se almacena en `client.data.actor`.

## Rooms

Los sockets se unen a rooms con formato: **`thread:${threadId}`**

## Eventos Client → Server

### `chat:join`

Unirse a un thread (room) para recibir mensajes.

**Payload:**
```typescript
{
  threadId: string  // UUID del thread
}
```

**ACK Response:**
```typescript
// Success
{
  ok: true,
  data: {
    threadId: string
  }
}

// Error
{
  ok: false,
  error: {
    code: "NOT_FOUND" | "FORBIDDEN" | "UNAUTHORIZED" | "INTERNAL_ERROR",
    message: string
  }
}
```

**Comportamiento:**
- Verifica que el thread existe
- Verifica que el actor (doctor o patient) es parte del thread
- Une el socket al room `thread:${threadId}`
- Si el actor no es parte del thread → `FORBIDDEN`
- Si el thread no existe → `NOT_FOUND`

---

### `chat:send`

Enviar un mensaje de texto en un thread.

**Payload:**
```typescript
{
  threadId: string,           // UUID del thread
  clientMessageId?: string,   // UUID opcional para deduplicación (idempotencia)
  kind: "text",               // Solo "text" está soportado actualmente
  text: string                // Texto del mensaje (requerido)
}
```

**ACK Response:**
```typescript
// Success
{
  ok: true,
  data: {
    message: {
      id: string,                      // UUID del mensaje creado
      threadId: string,
      senderUserId: string,
      senderRole: "doctor" | "patient",
      kind: "text",
      text: string,
      clientMessageId: string | null,
      contextConsultationId: string | null,  // UUID si hay consulta activa
      createdAt: string  // ISO 8601
    }
  }
}

// Error
{
  ok: false,
  error: {
    code: "THREAD_CLOSED_BY_DOCTOR" | 
          "PATIENT_MESSAGING_DISABLED" | 
          "RECENT_CONSULTATION_REQUIRED" | 
          "DAILY_LIMIT_REACHED" | 
          "RATE_LIMITED" | 
          "NOT_FOUND" | 
          "FORBIDDEN" | 
          "INVALID_ARGUMENT" | 
          "UNAUTHORIZED" | 
          "INTERNAL_ERROR",
    message: string
  }
}
```

**Comportamiento:**
1. **Deduplicación**: Si `clientMessageId` ya existe para el mismo `(threadId, senderUserId)`, retorna el mensaje existente sin crear uno nuevo (idempotencia)
2. **Validaciones**:
   - Doctor siempre puede enviar
   - Patient debe cumplir policy:
     - `closedByDoctor = false`
     - `patientCanMessage = true`
     - Si `requireRecentConsultation = true`: debe existir `Consultation` con `status=closed` y `closedAt >= now - recentConsultationWindowHours`
     - Daily limit no excedido (Redis)
     - Burst limit no excedido (Redis)
3. **Contexto**: Si hay `Consultation` con `status=in_progress` para el mismo doctor/patient, se setea `contextConsultationId`
4. **Broadcast**: Emite `chat:message` al room `thread:${threadId}`

**Códigos de Error:**
- `THREAD_CLOSED_BY_DOCTOR`: Thread cerrado por doctor
- `PATIENT_MESSAGING_DISABLED`: Patient messaging deshabilitado en policy
- `RECENT_CONSULTATION_REQUIRED`: Patient necesita consulta reciente pero no la tiene
- `DAILY_LIMIT_REACHED`: Patient excedió el límite diario de mensajes
- `RATE_LIMITED`: Patient excedió el burst limit (rate limit)
- `NOT_FOUND`: Thread no existe
- `FORBIDDEN`: Actor no es parte del thread
- `INVALID_ARGUMENT`: Payload inválido (falta threadId, text, o kind != "text")
- `UNAUTHORIZED`: Token inválido o no proporcionado

---

## Eventos Server → Client

### `chat:message`

Emitido cuando se crea un nuevo mensaje en un thread.

**Payload:**
```typescript
{
  message: {
    id: string,                      // UUID del mensaje
    threadId: string,
    senderUserId: string,
    senderRole: "doctor" | "patient",
    kind: "text",
    text: string,
    clientMessageId: string | null,
    contextConsultationId: string | null,
    createdAt: string,               // ISO 8601
    sender: {
      id: string,
      email: string,
      displayName: string | null
    }
  }
}
```

**Comportamiento:**
- Se emite a todos los sockets en el room `thread:${threadId}`
- Se emite incluso si el mensaje fue deduplicado (retorna mensaje existente)
- Todos los participantes del thread que estén en el room lo reciben

---

## Ejemplo de Uso

### JavaScript/TypeScript (Socket.IO Client)

```typescript
import { io, Socket } from 'socket.io-client';

const socket: Socket = io('http://localhost:3000/chats', {
  auth: {
    token: 'YOUR_JWT_ACCESS_TOKEN'
  },
  transports: ['websocket']
});

// Conectar
socket.on('connect', () => {
  console.log('Connected to /chats namespace');
});

// Unirse a thread
socket.emit('chat:join', { threadId: 'thread-uuid' }, (response) => {
  if (response.ok) {
    console.log('Joined thread:', response.data.threadId);
  } else {
    console.error('Join failed:', response.error);
  }
});

// Escuchar mensajes
socket.on('chat:message', (payload) => {
  console.log('New message:', payload.message);
});

// Enviar mensaje
socket.emit(
  'chat:send',
  {
    threadId: 'thread-uuid',
    clientMessageId: 'client-msg-uuid',  // Opcional, para idempotencia
    kind: 'text',
    text: 'Hola doctor'
  },
  (response) => {
    if (response.ok) {
      console.log('Message sent:', response.data.message);
    } else {
      console.error('Send failed:', response.error);
    }
  }
);
```

## Notas

1. **Idempotencia**: Usar `clientMessageId` (UUID) para prevenir duplicados en caso de reconexión/reintentos
2. **Rate Limits**: Patient messages están sujetos a rate limits (burst y daily) configurados en `ChatPolicy`
3. **Contexto de Consulta**: Si hay una consulta activa (`in_progress`), los mensajes se marcan con `contextConsultationId`
4. **Policy**: Solo doctor puede actualizar policy via HTTP endpoint `PATCH /api/v1/chats/threads/:threadId/policy`
5. **Rooms**: Los sockets deben unirse al room con `chat:join` antes de recibir mensajes

