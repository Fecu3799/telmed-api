#!/bin/bash
# dev-up.sh: Levanta toda la infraestructura de desarrollo

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

USE_NGROK=false
PIDS_DIR="$PROJECT_ROOT/.dev/pids"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --ngrok)
      USE_NGROK=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--ngrok]"
      exit 1
      ;;
  esac
done

# Create PIDs directory
mkdir -p "$PIDS_DIR"

# Cleanup function
cleanup() {
  echo ""
  echo "🛑 Limpiando procesos..."
  "$SCRIPT_DIR/dev-down.sh" || true
  exit 0
}

# Trap SIGINT and SIGTERM
trap cleanup SIGINT SIGTERM

# Check Docker
echo "🔍 Verificando Docker..."
if ! docker info > /dev/null 2>&1; then
  echo "❌ Error: Docker no está corriendo. Por favor abre Docker Desktop."
  exit 1
fi
echo "✅ Docker está corriendo"

# Start infrastructure
echo ""
echo "🐳 Levantando infraestructura..."
docker compose up -d

# Wait for services to be ready
echo "⏳ Esperando que los servicios estén listos..."
sleep 5

# Check if services are up
if ! docker compose ps | grep -q "Up"; then
  echo "⚠️  Advertencia: Algunos servicios pueden no estar listos aún"
fi

# Start Caddy
echo ""
echo "🚀 Iniciando Caddy..."
CADDY_PID_FILE="$PIDS_DIR/caddy.pid"
if [ -f "$CADDY_PID_FILE" ]; then
  old_pid=$(cat "$CADDY_PID_FILE")
  if ps -p "$old_pid" > /dev/null 2>&1; then
    echo "  ⚠️  Caddy ya está corriendo (PID $old_pid)"
  else
    rm -f "$CADDY_PID_FILE"
  fi
fi

if [ ! -f "$CADDY_PID_FILE" ]; then
  caddy run --config ./Caddyfile > "$PROJECT_ROOT/.dev/caddy.log" 2>&1 &
  CADDY_PID=$!
  echo $CADDY_PID > "$CADDY_PID_FILE"
  echo "  ✅ Caddy iniciado (PID $CADDY_PID)"
  sleep 2
fi

# Start Backend
echo ""
echo "🚀 Iniciando Backend..."
BACKEND_PID_FILE="$PIDS_DIR/backend.pid"
if [ -f "$BACKEND_PID_FILE" ]; then
  old_pid=$(cat "$BACKEND_PID_FILE")
  if ps -p "$old_pid" > /dev/null 2>&1; then
    echo "  ⚠️  Backend ya está corriendo (PID $old_pid)"
  else
    rm -f "$BACKEND_PID_FILE"
  fi
fi

if [ ! -f "$BACKEND_PID_FILE" ]; then
  npm run start:dev > "$PROJECT_ROOT/.dev/backend.log" 2>&1 &
  BACKEND_PID=$!
  echo $BACKEND_PID > "$BACKEND_PID_FILE"
  echo "  ✅ Backend iniciado (PID $BACKEND_PID)"
  sleep 3
fi

# Start Ngrok first (if requested) so we can get the URL before starting frontend
NGROK_API_BASE=""
if [ "$USE_NGROK" = true ]; then
  echo ""
  echo "🚀 Iniciando Ngrok..."
  
  # Check if ngrok is installed
  if ! command -v ngrok > /dev/null 2>&1; then
    echo "  ❌ Error: ngrok no está instalado."
    echo "  💡 Instala ngrok: https://ngrok.com/download"
    echo "  💡 O ejecuta sin --ngrok para desarrollo local"
    cleanup
    exit 1
  fi
  
  # Check for ngrok config
  NGROK_CONFIG="$HOME/.config/ngrok/ngrok.yml"
  if [ ! -f "$NGROK_CONFIG" ]; then
    echo "  ⚠️  Advertencia: Configuración de ngrok no encontrada en $NGROK_CONFIG"
    echo "  💡 Ejecuta: ngrok config add-authtoken <TU_TOKEN>"
  fi
  
  NGROK_PID_FILE="$PIDS_DIR/ngrok.pid"
  if [ -f "$NGROK_PID_FILE" ]; then
    old_pid=$(cat "$NGROK_PID_FILE")
    if ps -p "$old_pid" > /dev/null 2>&1; then
      echo "  ⚠️  Ngrok ya está corriendo (PID $old_pid)"
    else
      rm -f "$NGROK_PID_FILE"
    fi
  fi
  
  if [ ! -f "$NGROK_PID_FILE" ]; then
    # Start ngrok pointing to Caddy (port 8080)
    ngrok http 8080 > "$PROJECT_ROOT/.dev/ngrok.log" 2>&1 &
    NGROK_PID=$!
    echo $NGROK_PID > "$NGROK_PID_FILE"
    echo "  ✅ Ngrok iniciado (PID $NGROK_PID)"
    
    # Wait for ngrok to start and get the URL
    echo "  ⏳ Esperando URL de ngrok..."
    sleep 5
    
    # Try to get ngrok URL from API (localhost:4040)
    NGROK_URL=""
    if command -v curl > /dev/null 2>&1; then
      NGROK_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | grep -o '"public_url":"https://[^"]*"' | head -1 | cut -d'"' -f4 || echo "")
    fi
    
    if [ -z "$NGROK_URL" ]; then
      echo "  ⚠️  No se pudo obtener la URL de ngrok automáticamente"
      echo "  💡 Revisa la consola de ngrok en http://localhost:4040"
      ENV_LOCAL="$PROJECT_ROOT/apps/web/.env.local"
      if [ -f "$ENV_LOCAL" ]; then
        NGROK_API_BASE=$(grep "^VITE_NGROK_API_BASE_URL=" "$ENV_LOCAL" | cut -d'=' -f2 | tr -d '"' || echo "")
      fi
      if [ -z "$NGROK_API_BASE" ]; then
        echo "  ❌ Error: No se pudo obtener URL de ngrok y VITE_NGROK_API_BASE_URL no está configurada"
        cleanup
        exit 1
      fi
    else
      echo "  ✅ Ngrok URL: $NGROK_URL"
      
      # Read .env.local to get VITE_NGROK_API_BASE_URL or construct it
      ENV_LOCAL="$PROJECT_ROOT/apps/web/.env.local"
      if [ -f "$ENV_LOCAL" ]; then
        # Try to extract VITE_NGROK_API_BASE_URL from .env.local
        NGROK_API_BASE=$(grep "^VITE_NGROK_API_BASE_URL=" "$ENV_LOCAL" | cut -d'=' -f2 | tr -d '"' || echo "")
        if [ -z "$NGROK_API_BASE" ]; then
          # Construct it from ngrok URL
          NGROK_API_BASE="${NGROK_URL}/api/v1"
        fi
      else
        NGROK_API_BASE="${NGROK_URL}/api/v1"
      fi
      
      echo "  📝 Usando API base: $NGROK_API_BASE"
    fi
  else
    # Ngrok already running, try to get URL from .env.local
    ENV_LOCAL="$PROJECT_ROOT/apps/web/.env.local"
    if [ -f "$ENV_LOCAL" ]; then
      NGROK_API_BASE=$(grep "^VITE_NGROK_API_BASE_URL=" "$ENV_LOCAL" | cut -d'=' -f2 | tr -d '"' || echo "")
    fi
  fi
fi

# Start Frontend
echo ""
echo "🚀 Iniciando Frontend..."
FRONTEND_PID_FILE="$PIDS_DIR/frontend.pid"
if [ -f "$FRONTEND_PID_FILE" ]; then
  old_pid=$(cat "$FRONTEND_PID_FILE")
  if ps -p "$old_pid" > /dev/null 2>&1; then
    echo "  ⚠️  Frontend ya está corriendo (PID $old_pid)"
  else
    rm -f "$FRONTEND_PID_FILE"
  fi
fi

if [ ! -f "$FRONTEND_PID_FILE" ]; then
  # Set environment variables for frontend
  if [ "$USE_NGROK" = true ] && [ -n "$NGROK_API_BASE" ]; then
    export VITE_API_BASE_URL="$NGROK_API_BASE"
    echo "  📝 Configurando VITE_API_BASE_URL=$NGROK_API_BASE"
  else
    # For local mode, unset it so it falls back to VITE_LOCAL_API_BASE_URL
    unset VITE_API_BASE_URL
  fi
  
  cd apps/web
  npm run dev > "$PROJECT_ROOT/.dev/frontend.log" 2>&1 &
  FRONTEND_PID=$!
  cd "$PROJECT_ROOT"
  echo $FRONTEND_PID > "$FRONTEND_PID_FILE"
  echo "  ✅ Frontend iniciado (PID $FRONTEND_PID)"
  sleep 3
fi

# Summary
echo ""
echo "✅ Servicios levantados:"
echo "  🐳 Docker Compose: corriendo"
echo "  🚀 Caddy: http://localhost:8080"
echo "  🔧 Backend: http://localhost:3000"
echo "  💻 Frontend: http://localhost:5173"
if [ "$USE_NGROK" = true ]; then
  echo "  🌐 Ngrok: http://localhost:4040 (dashboard)"
fi
echo ""
echo "📋 Logs disponibles en: .dev/*.log"
echo "📊 Estado: npm run dev:status"
echo "🛑 Detener: npm run dev:down (o Ctrl+C)"
echo ""
echo "⏳ Esperando... (Ctrl+C para detener)"

# Wait indefinitely (until Ctrl+C)
wait
