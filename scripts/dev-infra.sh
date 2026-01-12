#!/bin/bash
# dev-infra.sh: Levanta solo la infraestructura (Docker Compose)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

echo "🚀 Levantando infraestructura (Docker Compose)..."
docker compose up -d

echo "⏳ Esperando que los servicios estén listos..."
sleep 3

echo "📊 Estado de los contenedores:"
docker compose ps

echo ""
echo "✅ Infraestructura levantada. Servicios disponibles en:"
echo "   - PostgreSQL: localhost:5432"
echo "   - Redis: localhost:6379"
echo "   - MinIO API: localhost:9000"
echo "   - MinIO Console: localhost:9001"
