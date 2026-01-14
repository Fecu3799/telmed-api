# TelMed Web Frontend

Frontend de TelMed construido con Vite + React + TypeScript.

## Instalación

```bash
cd apps/web
npm install
```

## Configuración

Copia el archivo `.env.example` a `.env` y ajusta las variables según tu entorno:

```bash
cp .env.example .env
```

Variables de entorno:
- `VITE_API_BASE_URL`: URL base del backend API (default: `http://localhost:3000/api/v1`)
  - Para desarrollo directo: `http://localhost:3000/api/v1`
  - Para desarrollo con gateway (Caddy): `/api/v1` (URL relativa)
- `VITE_LIVEKIT_URL`: URL del servidor LiveKit (opcional, solo necesario si el backend no devuelve `livekitUrl` en la respuesta del token)

**Nota**: El cliente HTTP soporta automáticamente URLs absolutas (`http://...`) y relativas (`/api/v1`). Ver [docs/dev-gateway.md](../../docs/dev-gateway.md) para más información sobre el gateway de desarrollo.

## Ejecución

### Desarrollo

```bash
npm run dev
```

El servidor de desarrollo se iniciará en `http://localhost:5173`.

**Nota:** El backend debe estar corriendo en `localhost:3000` para que el frontend funcione correctamente.

### Build

```bash
npm run build
```

Genera los archivos de producción en la carpeta `dist/`.

### Preview

```bash
npm run preview
```

Sirve los archivos de producción localmente para pruebas.

## Estructura

```
apps/web/
├── src/
│   ├── api/          # Cliente HTTP y funciones de API
│   ├── auth/         # Contexto de autenticación
│   ├── components/   # Componentes reutilizables
│   ├── pages/        # Páginas de la aplicación
│   ├── App.tsx       # Componente principal con routing
│   └── main.tsx      # Punto de entrada
├── package.json
└── vite.config.ts
```

## Autenticación

El frontend usa tokens JWT almacenados en memoria (context) y en `localStorage` solo durante desarrollo.

- Login: `POST /api/v1/auth/login` con `{ email, password }`
- Respuesta: `{ user, accessToken, refreshToken }`
- Headers: `Authorization: Bearer <accessToken>`

Las rutas `/lobby` y `/room` requieren autenticación. Si no hay token, se redirige a `/login`.

## Desarrollo

- El token se persiste en `localStorage` solo en modo desarrollo (`import.meta.env.DEV`)
- En producción, el token solo se mantiene en memoria
- Los errores se manejan según el formato Problem Details del backend

## Lobby (Alpha v0)

El Lobby es la pantalla principal para pruebas y desarrollo. Incluye:

### Demo Credentials

El Lobby permite gestionar sesiones separadas para doctor y patient:

1. **Credenciales por defecto:**
   - Doctor: `doctor.demo@telmed.test` / `Pass123!`
   - Patient: `patient.demo@telmed.test` / `Pass123!`

2. **Registro de usuarios demo:**
   - Usa el botón "Register Demo Users" para crear ambos usuarios
   - Si ya existen (409), el error se tolera y puedes hacer login directamente

3. **Gestión de sesiones:**
   - Los tokens se guardan por separado: `telmed.auth.doctorToken` y `telmed.auth.patientToken`
   - Puedes cambiar entre sesiones con "Use Doctor Session" / "Use Patient Session"
   - El token activo se usa automáticamente para todas las llamadas API

### Flujo Emergency End-to-End

#### 1. Preparación (Patient)

1. Login como patient usando las credenciales demo
2. Activa la sesión patient con "Use Patient Session"
3. Completa el Patient Identity:
   - Si falta, verás "✗ Incomplete"
   - Click en "Complete Now" o usa "Autocompletar" para datos demo
   - Guarda el formulario

#### 2. Preparación (Doctor)

1. Login como doctor usando las credenciales demo
2. Activa la sesión doctor con "Use Doctor Session"
3. Completa el Doctor Profile:
   - Si falta, verás "✗ Incomplete"
   - Click en "Complete Now" o usa "Autocompletar" para datos demo
   - Guarda el formulario (incluye `priceCents`)

#### 3. Crear Emergency (Patient)

1. Activa sesión patient
2. En "Emergency (Patient)":
   - Ingresa el `doctorUserId` (puedes obtenerlo del Session Status cuando estés como doctor)
   - Ingresa un `reason` (ej: "Dolor de cabeza intenso")
   - Click en "Create Emergency"
3. Se crea el queue item con `status=queued` y `paymentStatus=not_started`

#### 4. Accept Emergency (Doctor)

1. Activa sesión doctor
2. En "Emergency (Doctor)":
   - Click en "Refresh Queue" para ver los items
   - Busca el item con `entryType=emergency` y `status=queued`
   - Click en "Accept"
3. El item cambia a `status=accepted` y `paymentStatus=pending`

#### 5. Payment (Patient)

1. Activa sesión patient
2. En "Emergency (Patient)":
   - Verás el queue item con `paymentStatus=pending`
   - Click en "Pay"
   - Se abre una nueva pestaña con el checkout de Mercado Pago
3. Completa el pago en Mercado Pago (modo sandbox)
4. Click en "Refresh Status" para verificar que `paymentStatus=paid`

#### 6. Start Consultation (Doctor)

1. Activa sesión doctor
2. En "Emergency (Doctor)":
   - Verifica que el item tenga `paymentStatus=paid`
   - Click en "Start"
3. Se crea la consultation y navegas a `/room/:consultationId`
4. En la sala de videollamada, puedes unirte como doctor o patient (ver sección Consultation Room)

### Checklist de Prerequisitos

- **Patient Identity**: Requerido antes de crear emergencias
- **Doctor Profile**: Requerido antes de aceptar/iniciar consultas

Ambos tienen modales con:
- Campos editables según el DTO del backend
- Botón "Autocompletar" con datos determinísticos demo
- Manejo de errores Problem Details por campo

### Notas

- Los tokens se mantienen en `localStorage` solo en desarrollo
- El HTTP client usa automáticamente el token según `activeRole`
- Todos los endpoints siguen el contrato en `docs/frontend/CONTRACT.md`
- Los errores se muestran con `detail` y `errors` por campo cuando aplica

## Consultation Room (Video con LiveKit)

La sala de videollamada permite comunicación en tiempo real entre doctor y patient usando LiveKit.

### Configuración

**Variables de entorno requeridas:**
- `VITE_API_BASE_URL`: URL base del backend (default: `http://localhost:3000/api/v1`)
- `VITE_LIVEKIT_URL`: URL del servidor LiveKit (opcional, solo si el backend no devuelve `livekitUrl`)

**Nota:** El backend normalmente devuelve `livekitUrl` en la respuesta del token. Solo necesitas configurar `VITE_LIVEKIT_URL` si el backend no lo incluye.

### Funcionalidades

- **Unirse a la sala:** Botones "Join as Doctor" y "Join as Patient"
- **Video y audio:** Ambos habilitados por defecto
- **Vista de participantes:** Grid layout mostrando todos los participantes
- **Controles:** Barra de control para mutear audio/video, compartir pantalla, etc.
- **Estados:** Loading, connected, error con manejo de Problem Details
- **Debug:** Muestra primeros 8 caracteres del token para debugging

### Pruebas en 2 Dispositivos/Navegadores

Para probar la videollamada entre dos participantes:

#### Opción 1: Dos navegadores en la misma máquina

1. **Preparación:**
   - Asegúrate de tener una consulta en estado `in_progress` (sigue el flujo Emergency hasta "Start Consultation")
   - Obtén el `consultationId` de la URL después de hacer "Start"

2. **Navegador 1 (Doctor):**
   - Abre `http://localhost:5173/room/:consultationId` (reemplaza `:consultationId` con el ID real)
   - Login como doctor si es necesario
   - Click en "Join as Doctor"
   - Permite acceso a cámara y micrófono cuando el navegador lo solicite

3. **Navegador 2 (Patient):**
   - Abre la misma URL en una ventana de incógnito o otro navegador
   - Login como patient si es necesario
   - Click en "Join as Patient"
   - Permite acceso a cámara y micrófono

4. **Verificación:**
   - Deberías ver el video local en cada navegador
   - Deberías ver el video remoto del otro participante
   - El audio debería funcionar bidireccionalmente

#### Opción 2: Dos dispositivos en la misma red

1. **Preparación:**
   - Encuentra la IP local de tu máquina (ej: `192.168.1.100`)
   - Asegúrate de que el backend esté accesible desde ambos dispositivos
   - Configura `VITE_API_BASE_URL` si es necesario

2. **Dispositivo 1 (Doctor):**
   - Abre `http://192.168.1.100:5173/room/:consultationId` (o la IP de tu máquina)
   - Sigue los pasos del navegador 1

3. **Dispositivo 2 (Patient):**
   - Abre la misma URL desde el otro dispositivo
   - Sigue los pasos del navegador 2

#### Opción 3: Desarrollo local + dispositivo móvil

1. **Preparación:**
   - Conecta tu móvil a la misma red WiFi
   - Encuentra la IP local de tu máquina
   - Asegúrate de que Vite esté accesible desde la red local (puede requerir configuración adicional)

2. **Máquina (Doctor):**
   - Abre `http://localhost:5173/room/:consultationId`

3. **Móvil (Patient):**
   - Abre `http://192.168.1.100:5173/room/:consultationId` (IP de tu máquina)

### Troubleshooting

- **Error al conectar:** Verifica que el backend esté corriendo y que la consulta esté en estado `in_progress`
- **No se ve video:** Verifica permisos de cámara/micrófono en el navegador
- **Error de LiveKit URL:** Si el backend no devuelve `livekitUrl`, configura `VITE_LIVEKIT_URL` en tu `.env`
- **Conexión lenta:** Verifica la conexión a internet y la latencia del servidor LiveKit

### Notas Técnicas

- El token de LiveKit se obtiene del backend mediante `POST /consultations/:id/livekit-token`
- El backend determina el rol del usuario desde el JWT, pero el frontend envía `{ as: "doctor" | "patient" }` en el body
- La URL de LiveKit se obtiene de la respuesta del backend o de `VITE_LIVEKIT_URL` como fallback
- Los componentes de LiveKit manejan automáticamente la reconexión en caso de pérdida de conexión

## Disponibilidad y Reserva de Turnos (Scheduling)

El sistema permite a los doctores configurar su disponibilidad semanal y excepciones, y a los pacientes buscar y reservar turnos.

### Pruebas Manuales - Flujo Completo

#### 1. Configurar Disponibilidad del Doctor

1. **Login como doctor:**
   - Usa las credenciales demo: `doctor.demo@telmed.test` / `Pass123!`
   - Activa la sesión doctor con "Use Doctor Session"

2. **Navegar a "Mi Disponibilidad":**
   - En el Lobby, dentro de la sección "Doctor Profile Checklist", click en el botón "Mi Disponibilidad"
   - O navega directamente a `/doctor-availability`

3. **Configurar Reglas Semanales:**
   - En la sección "Reglas Semanales", para cada día de la semana:
     - Click en "+ Agregar" para agregar un horario
     - Configura `startTime` y `endTime` (ej: 09:00 - 12:00)
     - Marca/desmarca "Activo" según corresponda
     - Puedes agregar múltiples ventanas por día (ej: mañana y tarde)
   - Ejemplo: Configurar Lunes 09:00-12:00 como activo
   - Click en "Guardar Reglas"
   - Verifica que aparezca el mensaje de éxito

4. **Crear Excepción (Cerrar día):**
   - En la sección "Excepciones", selecciona una fecha futura
   - Selecciona tipo "Cerrar día"
   - Click en "Crear Excepción"
   - Verifica que aparezca en la lista de excepciones

5. **Crear Excepción (Horarios especiales):**
   - Selecciona otra fecha futura
   - Selecciona tipo "Horarios especiales"
   - Agrega ventanas de horario (ej: 10:00-11:00, 15:00-16:00)
   - Puedes agregar múltiples ventanas con el botón "+ Agregar"
   - Click en "Crear Excepción"
   - Verifica que aparezca en la lista con los horarios especiales

#### 2. Buscar Doctor y Ver Disponibilidad (Paciente)

1. **Login como paciente:**
   - Usa las credenciales demo: `patient.demo@telmed.test` / `Pass123!`
   - Activa la sesión patient con "Use Patient Session"

2. **Completar Patient Identity (si no está completo):**
   - En el Lobby, si ves "✗ Incomplete", click en "Complete Now"
   - Completa el formulario o usa "Autocompletar"
   - Guarda el formulario

3. **Buscar Doctor:**
   - Navega a `/doctor-search` o click en "Doctor Search" si hay un link
   - Busca el doctor (puedes usar el nombre o dejar vacío para listar todos)
   - Click en "Ver Perfil" del doctor deseado

4. **Ver Disponibilidad:**
   - En la página de perfil del doctor, verás la sección "Disponibilidad"
   - Los campos "Desde" y "Hasta" tienen valores por defecto:
     - Desde: hoy + 2 días (para evitar leadTime de 24h)
     - Hasta: desde + 14 días
   - Ajusta el rango si es necesario (máximo 60 días desde hoy)
   - Click en "Buscar Turnos"
   - Verifica que se muestren los slots disponibles agrupados por fecha
   - Los slots se muestran como botones con la hora (ej: "09:00", "09:20", etc.)

#### 3. Reservar Turno (Paciente)

1. **Seleccionar un slot:**
   - En la lista de slots disponibles, click en un horario
   - El botón cambiará a "Reservando..." mientras se procesa

2. **Verificar éxito:**
   - Si el Patient Identity está completo, deberías ver un mensaje de éxito
   - Se muestra la fecha/hora del turno reservado
   - Si hay un checkout de pago, aparecerá un botón "Ir a Pagar"
   - Opciones: "Ver Mis Turnos" (navega a `/appointments`) o "Reservar Otro"

3. **Verificar en lista de turnos:**
   - Click en "Ver Mis Turnos" o navega a `/appointments`
   - Verifica que el turno aparezca en la lista con el estado correcto

4. **Verificar desde el doctor:**
   - Cambia a sesión doctor
   - Navega a `/appointments` (si existe la página para doctores)
   - O verifica en el backend que el turno aparezca en `GET /doctors/me/appointments`

#### 4. Probar Error 409 (Conflicto - Slot ya reservado)

1. **Intentar reservar el mismo slot dos veces:**
   - Como paciente, busca disponibilidad del doctor
   - Reserva un slot
   - Sin refrescar, intenta reservar el mismo slot nuevamente
   - Deberías ver un error 409 con el mensaje: "El turno ya fue tomado. Por favor, selecciona otro horario."

2. **Verificar que el slot desaparece:**
   - Después de reservar un slot, click en "Buscar Turnos" nuevamente
   - El slot reservado no debería aparecer en la lista

#### 5. Validaciones y Edge Cases

1. **Validación de rango de fechas:**
   - Intenta buscar con "Desde" >= "Hasta" → debería mostrar error
   - Intenta buscar con rango > 60 días → debería mostrar advertencia (validación suave)

2. **Validación de horarios en reglas:**
   - Intenta guardar una regla con `startTime >= endTime` → debería mostrar error
   - Intenta guardar una ventana custom con `startTime >= endTime` → debería mostrar error

3. **Sin disponibilidad:**
   - Si un día no tiene reglas activas o está cerrado por excepción, no debería mostrar slots
   - Si todos los slots están reservados, debería mostrar "Sin disponibilidad para este rango de fechas"

4. **Patient Identity incompleto:**
   - Si intentas reservar sin completar Patient Identity, debería abrir el modal para completarlo
   - Después de completar, debería reintentar la reserva automáticamente

### Reglas de Negocio Implementadas

- **slotMinutes = 20**: Los slots se generan cada 20 minutos
- **leadTime = 24h**: No se pueden reservar turnos con menos de 24 horas de anticipación
- **horizon = 60d**: No se pueden reservar turnos más de 60 días en el futuro
- **No overlap**: El backend valida que no haya conflictos (409 Conflict si se intenta reservar un slot ya ocupado)

### Endpoints Utilizados

- `GET /doctors/me/availability-rules` - Listar reglas del doctor
- `PUT /doctors/me/availability-rules` - Actualizar reglas del doctor
- `GET /doctors/me/availability-exceptions` - Listar excepciones del doctor
- `POST /doctors/me/availability-exceptions` - Crear excepción
- `DELETE /doctors/me/availability-exceptions/:id` - Eliminar excepción
- `GET /doctors/:doctorUserId/availability` - Obtener slots disponibles (público)
- `POST /appointments` - Crear turno (paciente)
- `GET /patients/me/appointments` - Listar turnos del paciente
- `GET /doctors/me/appointments` - Listar turnos del doctor

### Notas Técnicas

- Los slots se agrupan por fecha en la UI para mejor visualización
- Los formatos de fecha/hora siguen el contrato: UI usa `YYYY-MM-DD` para inputs, API usa ISO UTC
- El manejo de errores muestra Problem Details con `title`, `detail`, `errors` y `traceId`
- Las validaciones client-side son suaves (UX), el backend siempre valida también

