# Gateway de Desarrollo Local

Este documento explica cómo usar un reverse proxy local (Caddy) para exponer tanto el frontend como el backend a través de un único puerto, permitiendo exponer todo con un solo túnel de ngrok.

## ¿Por qué usar el gateway?

- **Limitación de ngrok**: El plan gratuito de ngrok solo permite 1 endpoint público activo (mismo dominio)
- **Solución**: Unificar frontend y backend en un solo puerto local (8080) y exponer ese puerto con ngrok
- **Beneficio**: Acceso remoto completo con una sola URL pública

## Arquitectura

```
Internet → ngrok → localhost:8080 (Caddy) → {
  /api/* → localhost:3000 (Backend NestJS)
  /socket.io/* → localhost:3000 (Backend WebSocket)
  /* → localhost:5173 (Frontend Vite)
}
```

## Prerrequisitos

1. **Caddy instalado**:
   ```bash
   # macOS
   brew install caddy
   
   # Linux (Ubuntu/Debian)
   sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
   sudo apt update
   sudo apt install caddy
   
   # O descarga desde https://caddyserver.com/download
   ```

2. **Backend y Frontend corriendo**:
   - Backend: `npm run start:dev` (desde la raíz)
   - Frontend: `cd apps/web && npm run dev`

## Uso

### 1. Levantar los servicios

**Terminal 1 - Backend:**
```bash
npm run start:dev
```

**Terminal 2 - Frontend:**
```bash
cd apps/web
npm run dev
```

**Terminal 3 - Gateway:**
```bash
caddy run --config ./Caddyfile
```

### 2. Probar localmente

- **Frontend**: http://localhost:8080
- **Backend API**: http://localhost:8080/api/v1/auth/me (ejemplo)
- **WebSocket**: Se conecta automáticamente a través del gateway

### 3. Configurar Frontend para Gateway

Crea `apps/web/.env.local`:

```env
# Para usar con gateway (Caddy en :8080)
VITE_API_BASE_URL=/api/v1
VITE_SOCKET_URL=
```

**Nota**: 
- `VITE_SOCKET_URL` puede dejarse vacío si el frontend detecta automáticamente la URL base
- El cliente HTTP soporta automáticamente URLs relativas (que empiezan con `/`) y absolutas (que empiezan con `http://`)
- Para desarrollo sin gateway, usa: `VITE_API_BASE_URL=http://localhost:3000/api/v1`

### 4. Exponer con ngrok

Una vez que todo esté corriendo localmente:

```bash
ngrok http 8080
```

O si prefieres usar el script:

```bash
npm run ngrok
```

**Importante**: Actualiza tu configuración de ngrok (`~/.config/ngrok/ngrok.yml`) para usar el puerto 8080:

```yaml
version: "2"
tunnels:
  gateway:
    addr: 8080
    proto: http
```

Luego usa: `ngrok start gateway`

### 5. Acceso Remoto

Una vez que ngrok esté corriendo, obtendrás una URL pública (ej: `https://abc123.ngrok-free.app`). 

- **Frontend**: `https://abc123.ngrok-free.app`
- **Backend API**: `https://abc123.ngrok-free.app/api/v1/...`
- **WebSocket**: Se conecta automáticamente a través de la misma URL

## Configuración del Frontend

El frontend debe estar configurado para usar URLs relativas cuando se accede a través del gateway:

**Con Gateway (recomendado para ngrok):**
```env
# apps/web/.env.local
VITE_API_BASE_URL=/api/v1
```

**Sin Gateway (desarrollo local directo):**
```env
# apps/web/.env.local
VITE_API_BASE_URL=http://localhost:3000/api/v1
```

El cliente HTTP soporta ambas configuraciones automáticamente.

## Troubleshooting

### El frontend no se conecta al backend

- Verifica que `VITE_API_BASE_URL=/api/v1` esté configurado en `.env.local`
- Reinicia el servidor de Vite después de cambiar `.env.local`
- Verifica que Caddy esté corriendo y escuchando en el puerto 8080

### Errores de CORS

- El backend debe estar configurado para aceptar requests desde el dominio de ngrok
- Verifica la configuración de CORS en `src/main.ts`

### WebSocket no funciona

- Verifica que el path `/socket.io/*` esté siendo proxyado correctamente
- Revisa la configuración de Socket.IO en el backend para usar paths relativos

### Puerto 8080 ya en uso

- Cambia el puerto en `Caddyfile` de `:8080` a otro puerto (ej: `:8081`)
- Actualiza la configuración de ngrok para usar el nuevo puerto

## Notas

- El gateway solo es necesario cuando quieres exponer con ngrok
- Para desarrollo local normal, puedes seguir usando `localhost:3000` y `localhost:5173` directamente
- El `Caddyfile` está en la raíz del proyecto y no se versiona (puede agregarse a `.gitignore` si prefieres)

