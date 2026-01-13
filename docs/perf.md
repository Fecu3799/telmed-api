# Performance Monitoring

Este documento explica el sistema de observabilidad de performance liviana integrado en el backend.

## Características

- **Slow Requests**: Registro y logging de requests que superan un umbral configurable
- **Slow Queries**: Registro y logging de queries Prisma que superan un umbral
- **Métricas en memoria**: Almacenamiento de muestras y estadísticas agregadas (sin base de datos)
- **Endpoint interno**: Exposición de métricas para debug (protegido por token opcional)

## Variables de Entorno

### Configuración General

```env
# Habilitar métricas de performance (default: true en dev, false en prod)
PERF_METRICS_ENABLED=true

# Habilitar endpoint interno /api/v1/internal/perf (default: true en dev, false en prod)
PERF_ENDPOINT_ENABLED=true

# Token opcional para proteger el endpoint interno
# Si se configura, requiere header X-Internal-Debug-Token
PERF_DEBUG_TOKEN=your-secret-token-here
```

### Slow Requests

```env
# Umbral en ms para considerar un request como "lento" (default: 500)
SLOW_REQ_THRESHOLD_MS=500

# Máximo de muestras de slow requests a mantener en memoria (default: 200)
PERF_MAX_SLOW_REQUESTS=200

# Tamaño del top N de rutas más lentas (default: 20)
PERF_TOP_N=20

# Rate de muestreo (0.0 a 1.0) - opcional para reducir carga (default: 1.0)
PERF_SAMPLE_RATE=1.0
```

### Slow Queries (Prisma)

```env
# Umbral en ms para considerar una query como "lenta" (default: 200)
# Nota: También se respeta SLOW_QUERY_MS por compatibilidad
PRISMA_SLOW_QUERY_MS=200

# Habilitar logs detallados de todas las queries (default: false)
# No recomendado en producción (muy verboso)
PRISMA_QUERY_LOG_ENABLED=false

# Máximo de muestras de slow queries a mantener en memoria (default: 200)
PERF_MAX_SLOW_QUERIES=200
```

## Comportamiento

### Requests

- Solo se registran y loguean requests que superan `SLOW_REQ_THRESHOLD_MS`
- Se aplica `PERF_SAMPLE_RATE` (si está configurado < 1.0) para reducir carga
- Cada slow request se loguea como una línea JSON con:
  - `msg: "slow_request"`
  - `durationMs`, `method`, `path`, `routeKey`, `statusCode`
  - `traceId`, `actorId` (si disponible)

### Queries

- Solo se registran y loguean queries que superan `PRISMA_SLOW_QUERY_MS`
- Se usa `getTraceId()` del request context para correlación
- Cada slow query se loguea como una línea JSON con:
  - `msg: "slow_query"`
  - `durationMs`, `model`, `action`, `target`
  - `traceId`, `whereSummary` (estructura sanitizada, sin datos sensibles)

**Nota**: Si `DEBUG_DB=true`, se incluyen también `query` y `params` completos (útil para debugging pero puede exponer datos sensibles).

## Endpoint Interno

El endpoint `/api/v1/internal/perf` expone métricas agregadas en formato JSON.

### Habilitación

El endpoint solo está disponible si:
1. `PERF_ENDPOINT_ENABLED=true`
2. En desarrollo, está habilitado por defecto (salvo que se deshabilite explícitamente)

### Protección

Si `PERF_DEBUG_TOKEN` está configurado, el endpoint requiere el header:
```
X-Internal-Debug-Token: <PERF_DEBUG_TOKEN>
```

Sin el token (o con token incorrecto), retorna `401 Unauthorized`.

### Respuesta

```json
{
  "uptimeSeconds": 12345,
  "memory": {
    "rss": 123456789,
    "heapUsed": 45678901,
    "heapTotal": 78901234,
    "external": 1234567
  },
  "cpu": {
    "user": 12.34,
    "system": 5.67
  },
  "eventLoopLag": {
    "avg": 2.5,
    "max": 8.3
  },
  "slowRequests": {
    "last": [
      {
        "ts": 1234567890,
        "method": "POST",
        "path": "/api/v1/consultations",
        "routeKey": "POST /consultations",
        "statusCode": 200,
        "durationMs": 523,
        "traceId": "abc-123",
        "actorId": "user-456"
      }
    ],
    "topRoutes": [
      {
        "routeKey": "POST /consultations",
        "count": 15,
        "avg": 485.2,
        "p50": 420,
        "p95": 650,
        "max": 1200,
        "lastTs": 1234567890
      }
    ]
  },
  "slowQueries": {
    "last": [
      {
        "ts": 1234567890,
        "model": "Consultation",
        "action": "findMany",
        "durationMs": 234,
        "traceId": "abc-123",
        "whereSummary": "{id,status,patientUserId...}"
      }
    ],
    "top": [
      {
        "queryKey": "Consultation:findMany",
        "count": 20,
        "avg": 185.5,
        "p50": 150,
        "p95": 280,
        "max": 450,
        "lastTs": 1234567890
      }
    ]
  }
}
```

### Uso

```bash
# Sin token (si PERF_DEBUG_TOKEN no está configurado)
curl http://localhost:3000/api/v1/internal/perf

# Con token
curl -H "X-Internal-Debug-Token: your-secret-token-here" \
  http://localhost:3000/api/v1/internal/perf
```

## Interpretación de Métricas

### Slow Requests

- **last**: Últimas 50 requests lentas (más recientes primero)
- **topRoutes**: Top N rutas más lentas ordenadas por p95
  - `count`: Número total de requests lentas para esta ruta
  - `avg`: Duración promedio
  - `p50`: Percentil 50 (mediana)
  - `p95`: Percentil 95 (95% de requests son más rápidas)
  - `max`: Duración máxima observada

### Slow Queries

- **last**: Últimas 50 queries lentas (más recientes primero)
- **top**: Top N queries más lentas ordenadas por `max`
  - `queryKey`: Formato `model:action` (ej: `Consultation:findMany`)
  - Mismas estadísticas que routes (count, avg, p50, p95, max)

### Event Loop Lag

- Mide el retraso del event loop de Node.js
- `avg`: Promedio en milisegundos
- `max`: Máximo observado en milisegundos
- Valores altos (> 10ms) indican que el event loop está bloqueado

## Recomendaciones

### Umbrales para Desarrollo

```env
# Desarrollo: umbrales más bajos para detectar problemas temprano
SLOW_REQ_THRESHOLD_MS=300
PRISMA_SLOW_QUERY_MS=100
PERF_MAX_SLOW_REQUESTS=500
PERF_MAX_SLOW_QUERIES=500
PERF_TOP_N=30
```

### Producción

```env
# Producción: umbrales realistas y endpoint deshabilitado por defecto
PERF_METRICS_ENABLED=true
PERF_ENDPOINT_ENABLED=false  # Habilitar solo si necesitas debug
PERF_DEBUG_TOKEN=strong-random-token-here  # SI habilitas endpoint
SLOW_REQ_THRESHOLD_MS=500
PRISMA_SLOW_QUERY_MS=200
PERF_SAMPLE_RATE=1.0  # O 0.1 para reducir carga en alto tráfico
```

### Debugging

Para investigar un problema específico:

1. **Bajar umbrales temporalmente**:
   ```env
   SLOW_REQ_THRESHOLD_MS=0  # Captura todos los requests
   PRISMA_SLOW_QUERY_MS=0   # Captura todas las queries
   ```

2. **Habilitar logs detallados de DB**:
   ```env
   DEBUG_DB=true
   PRISMA_QUERY_LOG_ENABLED=true  # Incluye whereSummary
   ```

3. **Consultar endpoint interno**:
   ```bash
   curl -H "X-Internal-Debug-Token: your-token" \
     http://localhost:3000/api/v1/internal/perf | jq
   ```

4. **Buscar por traceId en logs**:
   ```bash
   grep "traceId.*abc-123" logs/app.log
   ```

## Limitaciones

- **Memoria**: Las métricas se almacenan en memoria. En caso de reinicio, se pierden.
- **Sin persistencia**: No se guardan en base de datos (diseño liviano).
- **Sin agregación histórica**: Solo muestra datos desde el último reinicio.
- **Percentiles aproximados**: Se calculan sobre un ring buffer de ~200 muestras por ruta/query.

## Integración con Logging Existente

- Los logs de slow requests/queries usan el mismo formato estructurado (JSON) que el resto del sistema
- Incluyen `traceId` para correlación con otros logs
- No duplican logs: si `PERF_METRICS_ENABLED=true`, `HttpLoggingInterceptor` se deshabilita (solo se loguean slow requests)
