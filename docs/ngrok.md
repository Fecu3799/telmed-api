# Configuración de ngrok para Desarrollo

Este documento explica cómo usar ngrok para exponer simultáneamente el backend y el frontend durante el desarrollo, permitiendo acceso desde dispositivos externos o para pruebas remotas.

> **Nota**: Si tienes limitaciones con ngrok (solo 1 endpoint público), considera usar el [Gateway de Desarrollo Local](./dev-gateway.md) que unifica frontend y backend en un solo puerto.

## Prerrequisitos

1. **ngrok instalado**: Descarga e instala ngrok desde [https://ngrok.com/download](https://ngrok.com/download)

2. **ngrok autenticado**: Necesitas un token de autenticación de ngrok (gratis o de pago)
   ```bash
   ngrok config add-authtoken <TU_TOKEN>
   ```
   Puedes obtener tu token en [https://dashboard.ngrok.com/get-started/your-authtoken](https://dashboard.ngrok.com/get-started/your-authtoken)

## Configuración

El archivo de configuración de ngrok está ubicado en `~/.config/ngrok/ngrok.yml` y contiene:

```yaml
version: "2"
tunnels:
  api:
    addr: 3000
    proto: http
  web:
    addr: 5173
    proto: http
```

Esta configuración crea dos túneles:
- **`api`**: Expone el backend NestJS en `http://localhost:3000`
- **`web`**: Expone el frontend Vite en `http://localhost:5173`

## Uso

### Iniciar ambos túneles

```bash
ngrok start --all
```

O usando el script npm (desde la raíz del proyecto):

```bash
npm run ngrok
```

### Identificar las URLs

Cuando ejecutas `ngrok start --all`, verás una salida similar a:

```
Session Status                online
Account                       tu-email@example.com
Version                       3.x.x
Region                        United States (us)
Latency                       -
Web Interface                 http://127.0.0.1:4040
Forwarding                    https://xxxx-xx-xx-xxx.ngrok-free.app -> http://localhost:3000
Forwarding                    https://yyyy-yy-yy-yyy.ngrok-free.app -> http://localhost:5173

Connections                   ttl     opn     rt1     rt5     p50     p90
                              0       0       0.00    0.00    0.00    0.00
```

**Cómo identificar cuál es cuál:**
- El túnel **`api`** (backend) es el que apunta a `http://localhost:3000`
- El túnel **`web`** (frontend) es el que apunta a `http://localhost:5173`

También puedes verificar en la interfaz web de ngrok en `http://127.0.0.1:4040` donde verás ambos túneles listados con sus nombres.

### Configurar el Frontend

Una vez que tengas las URLs públicas de ngrok, configura el frontend:

1. Crea o edita `apps/web/.env.local`:

```env
VITE_API_BASE_URL=https://<API_PUBLIC_URL>/api/v1
VITE_SOCKET_URL=https://<API_PUBLIC_URL>
```

**Importante:** 
- Reemplaza `<API_PUBLIC_URL>` con la URL del túnel **`api`** (sin el protocolo `https://`, solo el dominio)
- Ejemplo: Si el túnel `api` es `https://abc123.ngrok-free.app`, entonces:
  ```env
  VITE_API_BASE_URL=https://abc123.ngrok-free.app/api/v1
  VITE_SOCKET_URL=https://abc123.ngrok-free.app
  ```

2. Reinicia el servidor de desarrollo de Vite para que cargue las nuevas variables:

```bash
cd apps/web
npm run dev
```

### Acceso desde otra PC/Dispositivo

Para acceder a la aplicación desde otra PC o dispositivo:

1. Asegúrate de que ambos servidores estén corriendo:
   - Backend: `npm run start:dev` (en el root)
   - Frontend: `npm run dev` (en `apps/web`)

2. Asegúrate de que ngrok esté corriendo: `ngrok start --all`

3. Usa la URL del túnel **`web`** (frontend) en el navegador del dispositivo remoto:
   - Ejemplo: `https://yyyy-yy-yy-yyy.ngrok-free.app`

4. El frontend configurado con `VITE_API_BASE_URL` se conectará automáticamente al backend a través del túnel `api`.

## Notas Importantes

- **URLs dinámicas**: Las URLs de ngrok cambian cada vez que reinicias ngrok (a menos que uses un plan de pago con dominios estáticos)
- **Actualizar .env.local**: Si reinicias ngrok y obtienes nuevas URLs, actualiza `apps/web/.env.local` con la nueva URL del túnel `api`
- **CORS**: El backend debe estar configurado para aceptar requests desde el dominio de ngrok del frontend
- **WebSocket**: Si usas WebSockets, asegúrate de configurar `VITE_SOCKET_URL` correctamente
- **HTTPS**: ngrok proporciona HTTPS automáticamente, lo cual es útil para probar funcionalidades que requieren HTTPS (como acceso a cámara/micrófono)

## Troubleshooting

- **Error "authtoken not found"**: Ejecuta `ngrok config add-authtoken <TU_TOKEN>`
- **Puerto ya en uso**: Asegúrate de que los puertos 3000 y 5173 no estén siendo usados por otros procesos
- **Frontend no se conecta al backend**: Verifica que `VITE_API_BASE_URL` apunte al túnel `api` (no al `web`)
- **CORS errors**: Verifica la configuración de CORS en el backend para permitir el dominio de ngrok del frontend

