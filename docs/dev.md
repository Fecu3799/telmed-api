# Desarrollo Local - Guía Rápida

Esta guía explica cómo levantar el entorno de desarrollo completo con un solo comando.

## Prerrequisitos

- **Docker Desktop** instalado y corriendo
- **Node.js** (versión 18+)
- **Caddy** instalado (para reverse proxy)
- **ngrok** (opcional, solo para webhooks/exposición externa)

### Instalar Caddy

```bash
# macOS
brew install caddy

# Linux (Ubuntu/Debian)
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

### Instalar ngrok (opcional)

```bash
# macOS
brew install ngrok/ngrok/ngrok

# O descargar desde https://ngrok.com/download
# Luego autenticar:
ngrok config add-authtoken <TU_TOKEN>
```

## Configuración del Frontend

Crea `apps/web/.env.local` con las siguientes variables:

```env
# URL base para desarrollo local (con Caddy en :8080)
VITE_LOCAL_API_BASE_URL=http://localhost:8080/api/v1

# URL base para ngrok (cuando uses --ngrok)
# Reemplaza con tu URL de ngrok (se obtiene al ejecutar ngrok)
VITE_NGROK_API_BASE_URL=https://xxxx-xx-xx-xxx.ngrok-free.app/api/v1
```

**Nota**: `VITE_API_BASE_URL` se establece dinámicamente por los scripts y tiene prioridad sobre las otras variables.

## Uso

### Desarrollo Local (sin ngrok)

```bash
npm run dev
```

Esto levanta:
- Docker Compose (PostgreSQL, Redis, MinIO)
- Caddy (reverse proxy en puerto 8080)
- Backend NestJS (puerto 3000)
- Frontend Vite (puerto 5173)

**Acceso:**
- Frontend: http://localhost:8080 (a través de Caddy)
- Backend API: http://localhost:8080/api/v1
- MinIO Console: http://localhost:9001

### Desarrollo con Ngrok

```bash
npm run dev:ngrok
```

Además de los servicios anteriores, levanta ngrok apuntando a Caddy (puerto 8080).

**Nota**: El script intenta obtener automáticamente la URL de ngrok. Si no puede obtenerla, usará `VITE_NGROK_API_BASE_URL` de `.env.local`. Si ninguna está disponible, el script fallará con un error claro.

### Solo Infraestructura

```bash
npm run dev:infra
```

Levanta solo Docker Compose (útil si quieres usar los servicios por separado).

### Ver Estado

```bash
npm run dev:status
```

Muestra el estado de:
- Contenedores de Docker Compose
- Procesos (backend, frontend, caddy, ngrok)
- Puertos en uso

### Detener Servicios

```bash
# Detener procesos (backend, frontend, caddy, ngrok)
# Docker Compose sigue corriendo
npm run dev:down

# Detener todo (incluyendo Docker Compose)
npm run dev:down:all
```

## Arquitectura

```
┌─────────────────────────────────────────┐
│         Desarrollo Local                │
├─────────────────────────────────────────┤
│                                         │
│  Frontend (Vite :5173)                 │
│         ↓                               │
│  Caddy (:8080)                         │
│    ├─ /api/* → Backend (:3000)         │
│    └─ /* → Frontend (:5173)            │
│                                         │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│         Con Ngrok (--ngrok)            │
├─────────────────────────────────────────┤
│                                         │
│  Internet                               │
│    ↓                                    │
│  Ngrok (https://xxxx.ngrok-free.app)   │
│    ↓                                    │
│  Caddy (:8080)                         │
│    ├─ /api/* → Backend (:3000)         │
│    └─ /* → Frontend (:5173)            │
│                                         │
└─────────────────────────────────────────┘
```

## Resolución de Base URL en el Frontend

El frontend resuelve la URL base de la API en este orden:

1. `VITE_API_BASE_URL` (establecida dinámicamente por scripts)
2. `VITE_LOCAL_API_BASE_URL` (de `.env.local`)
3. `window.location.origin` (fallback)

Cuando usas `npm run dev` (sin ngrok), el frontend usa `VITE_LOCAL_API_BASE_URL` que apunta a `http://localhost:8080/api/v1`.

Cuando usas `npm run dev:ngrok`, el script establece `VITE_API_BASE_URL` automáticamente usando la URL de ngrok obtenida de su API o de `VITE_NGROK_API_BASE_URL` en `.env.local`.

## Logs

Los logs de los servicios se guardan en `.dev/`:
- `.dev/backend.log`
- `.dev/frontend.log`
- `.dev/caddy.log`
- `.dev/ngrok.log`

## Troubleshooting

### Docker no está corriendo

```
❌ Error: Docker no está corriendo. Por favor abre Docker Desktop.
```

**Solución**: Abre Docker Desktop y espera a que esté completamente iniciado.

### Puerto ya en uso

Si un puerto (3000, 5173, 8080) está en uso:

1. Verifica qué proceso lo está usando: `npm run dev:status`
2. Detén el proceso manualmente o usa `npm run dev:down`

### Ngrok no encuentra configuración

```
⚠️  Advertencia: Configuración de ngrok no encontrada
```

**Solución**: Ejecuta `ngrok config add-authtoken <TU_TOKEN>`. Obtén tu token en https://dashboard.ngrok.com/get-started/your-authtoken

### Frontend no se conecta al backend

1. Verifica que Caddy esté corriendo: `npm run dev:status`
2. Verifica la configuración en `apps/web/.env.local`
3. Revisa los logs en `.dev/frontend.log` y `.dev/backend.log`
