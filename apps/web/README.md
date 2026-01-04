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
4. El Room es placeholder por ahora (siguiente paso)

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

