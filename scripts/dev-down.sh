#!/bin/bash
# dev-down.sh: Detiene los procesos de desarrollo (backend, frontend, caddy, ngrok)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

PIDS_DIR="$PROJECT_ROOT/.dev/pids"
DOWN_DOCKER=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --down)
      DOWN_DOCKER=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--down]"
      echo "  --down  Also run 'docker compose down' (without removing volumes)"
      exit 1
      ;;
  esac
done

echo "🛑 Deteniendo servicios de desarrollo..."

# Kill processes by PID files
if [ -d "$PIDS_DIR" ]; then
  for pid_file in "$PIDS_DIR"/*.pid; do
    if [ -f "$pid_file" ]; then
      service=$(basename "$pid_file" .pid)
      pid=$(cat "$pid_file" 2>/dev/null || echo "")
      if [ -n "$pid" ] && ps -p "$pid" > /dev/null 2>&1; then
        echo "  🔪 Deteniendo $service (PID $pid)..."
        kill "$pid" 2>/dev/null || true
        # Wait a bit and force kill if still running
        sleep 1
        if ps -p "$pid" > /dev/null 2>&1; then
          kill -9 "$pid" 2>/dev/null || true
        fi
        rm -f "$pid_file"
        echo "  ✅ $service detenido"
      else
        rm -f "$pid_file"
      fi
    fi
  done
fi

# Optionally stop Docker Compose
if [ "$DOWN_DOCKER" = true ]; then
  echo ""
  echo "🐳 Deteniendo Docker Compose..."
  docker compose down
  echo "✅ Docker Compose detenido"
else
  echo ""
  echo "ℹ️  Docker Compose sigue corriendo (usa --down para detenerlo)"
fi

echo ""
echo "✅ Servicios de desarrollo detenidos"
