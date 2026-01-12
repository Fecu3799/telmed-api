#!/bin/bash
# dev-status.sh: Muestra el estado de los servicios de desarrollo

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

PIDS_DIR="$PROJECT_ROOT/.dev/pids"

echo "📊 Estado de Desarrollo"
echo "======================"
echo ""

# Docker Compose status
echo "🐳 Docker Compose:"
docker compose ps 2>/dev/null || echo "  (docker compose no disponible o no hay servicios)"
echo ""

# PIDs
echo " processes:"
if [ -d "$PIDS_DIR" ]; then
  for pid_file in "$PIDS_DIR"/*.pid; do
    if [ -f "$pid_file" ]; then
      service=$(basename "$pid_file" .pid)
      pid=$(cat "$pid_file" 2>/dev/null || echo "")
      if [ -n "$pid" ] && ps -p "$pid" > /dev/null 2>&1; then
        echo "  ✅ $service: PID $pid (running)"
      else
        echo "  ❌ $service: PID file exists but process not running"
      fi
    fi
  done
else
  echo "  (no hay archivos PID - servicios no iniciados por script)"
fi
echo ""

# Ports (macOS/Linux)
echo "🔌 Puertos en uso:"
if command -v lsof > /dev/null 2>&1; then
  for port in 3000 5173 8080 9000 9001; do
    if lsof -ti:$port > /dev/null 2>&1; then
      pid=$(lsof -ti:$port | head -1)
      process=$(ps -p "$pid" -o comm= 2>/dev/null || echo "unknown")
      echo "  ✅ puerto $port: PID $pid ($process)"
    else
      echo "  ❌ puerto $port: libre"
    fi
  done
elif command -v netstat > /dev/null 2>&1; then
  for port in 3000 5173 8080 9000 9001; do
    if netstat -tuln 2>/dev/null | grep -q ":$port "; then
      echo "  ✅ puerto $port: en uso"
    else
      echo "  ❌ puerto $port: libre"
    fi
  done
else
  echo "  (lsof/netstat no disponible para verificar puertos)"
fi
