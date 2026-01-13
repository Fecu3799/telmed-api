# Pruebas Manuales de Performance

## Setup Inicial

```bash
export API_BASE="http://localhost:3000/api/v1"
export PERF_TOKEN="${PERF_DEBUG_TOKEN:-}"
export AUTH_EMAIL="test@example.com"
export AUTH_PASSWORD="password123"
```

## 1. Login y Obtener Token

```bash
TOKEN=$(curl -s -X POST "$API_BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$AUTH_EMAIL\",\"password\":\"$AUTH_PASSWORD\"}" \
  | jq -r '.accessToken')

echo "Token: $TOKEN"
```

## 2. Consultar Métricas (Función Helper)

```bash
get_perf() {
  if [ -n "$PERF_TOKEN" ]; then
    curl -s -X GET "$API_BASE/internal/perf" -H "X-Internal-Debug-Token: $PERF_TOKEN"
  else
    curl -s -X GET "$API_BASE/internal/perf"
  fi
}
```

## 3. Generar Tráfico Normal (Requests Rápidos)

```bash
for i in {1..10}; do
  curl -s -X GET "$API_BASE/auth/me" \
    -H "Authorization: Bearer $TOKEN" > /dev/null
  echo "Request $i completed"
done
```

## 4. Consultar Métricas de Performance

```bash
get_perf | jq '.'
```

## 5. Métricas Específicas con jq

### Uptime y Memoria

```bash
get_perf | jq '{
  uptime: .uptimeSeconds,
  memory: {
    heapUsedMB: (.memory.heapUsed / 1024 / 1024 | floor),
    heapTotalMB: (.memory.heapTotal / 1024 / 1024 | floor),
    rssMB: (.memory.rss / 1024 / 1024 | floor)
  },
  eventLoopLag: .eventLoopLag
}'
```

### Slow Requests (Últimas 10)

```bash
get_perf | jq '.slowRequests.last[:10] | map({
  route: .routeKey,
  duration: .durationMs,
  status: .statusCode,
  traceId: .traceId
})'
```

### Top Routes Más Lentas

```bash
get_perf | jq '.slowRequests.topRoutes | map({
  route: .routeKey,
  count: .count,
  avg: (.avg | floor),
  p95: .p95,
  max: .max
})'
```

### Slow Queries (Últimas 10)

```bash
get_perf | jq '.slowQueries.last[:10] | map({
  model: .model,
  action: .action,
  duration: .durationMs,
  traceId: .traceId,
  whereSummary: .whereSummary
})'
```

### Top Queries Más Lentas

```bash
get_perf | jq '.slowQueries.top | map({
  query: .queryKey,
  count: .count,
  avg: (.avg | floor),
  p95: .p95,
  max: .max
})'
```

### Resumen Compacto

```bash
get_perf | jq '{
  uptime: .uptimeSeconds,
  slowRequestsCount: (.slowRequests.last | length),
  topSlowRoute: .slowRequests.topRoutes[0],
  slowQueriesCount: (.slowQueries.last | length),
  topSlowQuery: .slowQueries.top[0],
  memoryHeapMB: (.memory.heapUsed / 1024 / 1024 | floor)
}'
```

## 6. Generar Tráfico Masivo (Stress Test Básico)

```bash
for i in {1..50}; do
  curl -s -X GET "$API_BASE/auth/me" \
    -H "Authorization: Bearer $TOKEN" > /dev/null &
done
wait
echo "50 requests completed"
```

## 7. Monitoreo Continuo (Watch Mode)

```bash
watch -n 2 'get_perf | jq "{
  uptime: .uptimeSeconds,
  slowReqs: (.slowRequests.last | length),
  slowQueries: (.slowQueries.last | length),
  topRoute: .slowRequests.topRoutes[0].routeKey,
  topRouteP95: .slowRequests.topRoutes[0].p95
}"'
```

## 8. Comparar Métricas Antes/Después

```bash
echo "=== BEFORE ==="
BEFORE=$(get_perf | jq '.slowRequests.last | length')
echo "Slow requests: $BEFORE"

for i in {1..20}; do
  curl -s -X GET "$API_BASE/auth/me" \
    -H "Authorization: Bearer $TOKEN" > /dev/null
done

echo "=== AFTER ==="
AFTER=$(get_perf | jq '.slowRequests.last | length')
echo "Slow requests: $AFTER"
echo "Delta: $((AFTER - BEFORE))"
```

## 9. Filtrar por TraceId Específico

```bash
TRACE_ID="your-trace-id-here"
get_perf | jq --arg trace "$TRACE_ID" '.slowRequests.last[] | select(.traceId == $trace)'
```

## 10. Exportar Métricas a Archivo

```bash
get_perf | jq '.' > perf-metrics-$(date +%Y%m%d-%H%M%S).json
```

## 11. Verificar que No Haya Slow Requests (Estado Limpio)

```bash
get_perf | jq 'if .slowRequests.last | length == 0 then "✅ No slow requests" else "⚠️  Found \(.slowRequests.last | length) slow requests" end'
```

## 12. Gráfico de Distribución de Duración (Top Routes)

```bash
get_perf | jq -r '.slowRequests.topRoutes[] | "\(.routeKey): avg=\(.avg | floor)ms, p95=\(.p95)ms, max=\(.max)ms"'
```
