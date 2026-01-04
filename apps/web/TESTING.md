# Guía de Pruebas - TelMed Frontend

Esta guía explica paso a paso cómo probar el frontend desde cero.

## Prerequisitos

1. **Backend corriendo**: El backend NestJS debe estar corriendo en `http://localhost:3000`
2. **Base de datos**: PostgreSQL debe estar corriendo y las migraciones aplicadas
3. **Frontend**: El frontend debe estar corriendo en `http://localhost:5173`

## Opción 1: Usar el Lobby para Registrar Usuarios (Recomendado)

Esta es la forma más fácil y está integrada en el Lobby.

### Paso 1: Iniciar el Backend

```bash
# En la raíz del proyecto
npm run start:dev
```

Verifica que esté corriendo en `http://localhost:3000`

### Paso 2: Iniciar el Frontend

```bash
# En otra terminal
cd apps/web
npm run dev
```

Debería abrirse en `http://localhost:5173`

### Paso 3: Ir al Lobby (sin login)

Si no tienes sesión, el sistema te redirigirá a `/login`. Pero puedes ir directamente a `/lobby` y el sistema te redirigirá automáticamente.

**O mejor aún**: Ve directamente a `http://localhost:5173/lobby` en tu navegador.

### Paso 4: Registrar Usuarios Demo

En el Lobby verás la sección **"Demo Credentials"**:

1. **Credenciales por defecto** (ya están prellenadas):
   - Doctor: `doctor.demo@telmed.test` / `Pass123!`
   - Patient: `patient.demo@telmed.test` / `Pass123!`

2. **Click en "Register Demo Users"**:
   - Esto intenta registrar ambos usuarios
   - Si ya existen (error 409), no pasa nada, puedes continuar
   - Si se crean exitosamente, verás que se completó

3. **Login separado**:
   - Click en **"Login Doctor"** → Esto guarda el token del doctor
   - Click en **"Login Patient"** → Esto guarda el token del patient
   - Los tokens se guardan por separado en `localStorage`

4. **Activar sesión**:
   - Click en **"Use Doctor Session"** o **"Use Patient Session"**
   - Esto cambia qué token se usa para las llamadas API

## Opción 2: Registrar Manualmente con el Endpoint

Si prefieres registrar usuarios manualmente antes de usar el Lobby:

### Usando curl:

```bash
# Registrar doctor
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "doctor.demo@telmed.test",
    "password": "Pass123!",
    "role": "doctor"
  }'

# Registrar patient
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "patient.demo@telmed.test",
    "password": "Pass123!",
    "role": "patient"
  }'
```

### Usando el Login Page del Frontend:

1. Ve a `http://localhost:5173/login`
2. Ingresa las credenciales (ej: `doctor.demo@telmed.test` / `Pass123!`)
3. Si el usuario no existe, verás un error
4. Si existe, te redirigirá a `/lobby`

## Flujo Completo de Pruebas

### 1. Preparación Inicial

1. **Asegúrate de que el backend esté corriendo**
2. **Abre el frontend** en `http://localhost:5173`
3. **Ve al Lobby** (`http://localhost:5173/lobby`)

### 2. Registrar y Login (Primera Vez)

1. En el Lobby, sección **"Demo Credentials"**
2. Click en **"Register Demo Users"** (esto crea ambos usuarios si no existen)
3. Click en **"Login Doctor"** (guarda el token del doctor)
4. Click en **"Login Patient"** (guarda el token del patient)

### 3. Activar Sesión y Verificar Estado

1. Click en **"Use Doctor Session"**
2. Verifica en **"Session Status"** que se muestre:
   - User ID
   - Role: `doctor`
   - Has Patient Identity: `false` (porque es doctor)

3. Click en **"Use Patient Session"**
4. Verifica que ahora muestre:
   - Role: `patient`
   - Has Patient Identity: `false` (aún no completado)

### 4. Completar Patient Identity

1. Con sesión **patient** activa
2. En **"Patient Identity Checklist"** verás "✗ Incomplete"
3. Click en **"Complete Now"**
4. En el modal:
   - Puedes llenar manualmente los campos
   - O click en **"Autocompletar"** para datos demo
5. Click en **"Guardar"**
6. Verifica que ahora muestre "✓ Complete" con los datos

### 5. Completar Doctor Profile

1. Activa sesión **doctor**
2. En **"Doctor Profile Checklist"** verás "✗ Incomplete"
3. Click en **"Complete Now"**
4. En el modal:
   - Puedes llenar manualmente
   - O click en **"Autocompletar"** (pone "Dr Demo", priceCents=120000)
5. Click en **"Guardar"**
6. Verifica que ahora muestre "✓ Complete"

### 6. Crear Emergency (Como Patient)

1. Activa sesión **patient**
2. En **"Emergency (Patient)"**:
   - Necesitas el `doctorUserId` del doctor
   - Para obtenerlo: activa sesión doctor → ve "Session Status" → copia el `id`
3. Ingresa:
   - **Doctor User ID**: pega el UUID del doctor
   - **Reason**: "Dolor de cabeza intenso" (o cualquier motivo)
4. Click en **"Create Emergency"**
5. Verás el queue item creado con:
   - Queue ID
   - Status: `queued`
   - Payment Status: `not_started`

### 7. Accept Emergency (Como Doctor)

1. Activa sesión **doctor**
2. En **"Emergency (Doctor)"**:
   - Click en **"Refresh Queue"**
3. Verás el queue item que creó el patient:
   - Queue ID
   - Patient ID
   - Reason
   - Status: `queued`
   - Entry Type: `emergency`
4. Click en **"Accept"**
5. El status cambia a `accepted` y `paymentStatus` a `pending`

### 8. Pagar Emergency (Como Patient)

1. Activa sesión **patient**
2. En **"Emergency (Patient)"**:
   - Verás el queue item con `paymentStatus: pending`
3. Click en **"Pay"**
4. Se abre una nueva pestaña con el checkout de Mercado Pago
5. Completa el pago (en modo sandbox puedes usar tarjetas de prueba)
6. Vuelve al Lobby y click en **"Refresh Status"**
7. Verifica que `paymentStatus` cambió a `paid`

### 9. Start Consultation (Como Doctor)

1. Activa sesión **doctor**
2. En **"Emergency (Doctor)"**:
   - Click en **"Refresh Queue"**
3. Verás el queue item con `paymentStatus: paid`
4. Click en **"Start"**
5. Se crea la consultation y navegas a `/room/:consultationId`
6. El Room es placeholder por ahora (siguiente paso de desarrollo)

## Verificación de Tokens en localStorage

Para verificar que los tokens se guardaron correctamente:

1. Abre DevTools (F12)
2. Ve a **Application** → **Local Storage** → `http://localhost:5173`
3. Deberías ver:
   - `telmed.auth.doctorToken`: token del doctor
   - `telmed.auth.patientToken`: token del patient
   - `telmed.auth.activeRole`: `"doctor"` o `"patient"`

## Troubleshooting

### Error: "User not found" o 404

- El usuario no existe en la BD
- Usa "Register Demo Users" en el Lobby
- O registra manualmente con curl/Postman

### Error: "Invalid credentials" o 401

- La contraseña es incorrecta
- Por defecto es `Pass123!` (con mayúscula, minúscula, número y símbolo)
- Verifica que el usuario exista en la BD

### Error: "Doctor not found" o "Patient not found" (404)

- El perfil no está completo
- Completa el Patient Identity o Doctor Profile primero
- Usa los modales en el Lobby

### Error: "Waiting room not available"

- Esto es para appointments con ventana de tiempo
- Para emergencias (sin appointmentId) no aplica
- Asegúrate de no estar pasando `appointmentId` en el createQueue

### Los tokens no se guardan

- Verifica que estés en modo desarrollo (`import.meta.env.DEV`)
- En producción, los tokens solo están en memoria
- Revisa la consola del navegador por errores

## Próximos Pasos

Una vez que tengas el flujo básico funcionando:

1. **Room**: Implementar la pantalla de consulta con LiveKit
2. **Chat**: Agregar mensajería en tiempo real
3. **Files**: Subir/descargar archivos durante la consulta
4. **Appointments**: Flujo completo de agendamiento

## Notas Importantes

- Los tokens se guardan en `localStorage` **solo en desarrollo**
- En producción, los tokens solo estarán en memoria
- El backend debe estar corriendo en `localhost:3000`
- El frontend debe estar corriendo en `localhost:5173`
- Todos los endpoints siguen el contrato en `docs/frontend/CONTRACT.md`

