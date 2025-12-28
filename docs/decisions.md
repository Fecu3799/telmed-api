# Decisions

- dinero: priceCents es interno (Int). La UI puede mostrar pesos sin decimales.
- displayName vive en User para evitar duplicacion entre perfiles.
- PostGIS/Unsupported: migraciones SQL manuales, no depender de migrate dev autogenerando location.
- auth: JWT access+refresh con sessions en DB y rate limiting con Redis.
- seed admin: se crea via `npm run db:seed` usando `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD` (idempotente, no se loguea la password).
- PrismaClient + adapter-pg required:
  - En scripts no usamos `new PrismaClient()` directo, sino el adapter-pg.
  - Snippet:

    ```ts
    import { createPrismaWithPgAdapter } from 'src/infra/prisma/prisma-adapter.factory';

    const { prisma, disconnect } = createPrismaWithPgAdapter(
      process.env.DATABASE_URL!,
    );
    ```
- availability/scheduling:
  - reglas semanales: dayOfWeek (0-6) + startTime/endTime en formato "HH:mm".
  - excepciones por fecha: type closed o custom; customWindows reemplaza completamente el dia.
  - slotDurationMinutes fijo en 20 (preparado para ser configurable a futuro).
  - si hay config persistida en DB, prevalece sobre el default.
  - leadTimeHours 24 y horizonDays 60 para limites de consulta de disponibilidad.
  - timezone por doctor en DoctorSchedulingConfig (default America/Argentina/Buenos_Aires).
  - endpoint publico devuelve slots en UTC (ISO), calculados segun la timezone del doctor.
  - validaciones reglas:
    - dayOfWeek int 0..6.
    - startTime/endTime con regex HH:mm, start < end.
    - sin solapamientos por dia (solo reglas activas).
  - validaciones excepciones:
    - date formato YYYY-MM-DD.
    - type enum closed|custom.
    - closed no permite customWindows.
    - custom requiere customWindows no vacio.
    - ventanas con HH:mm, start < end, sin solapamientos.
  - validaciones disponibilidad publica:
    - from/to ISO, from < to.
    - from >= ahora + leadTimeHours.
    - to <= ahora + horizonDays.
  - recomendaciones frontend:
    - al armar reglas/ventanas, usar multiples de 20 minutos.
    - en queries publicas, usar timestamps con hora (no solo fecha) para evitar fallas por lead time.

## Deuda técnica

- LegacyRouteConverter warning por wildcard; se aborda cuando migremos middleware routing a patrones named params / upgrades.

## CI

- Secrets requeridos en GitHub Actions:
  - `JWT_ACCESS_SECRET`
  - `JWT_REFRESH_SECRET`
- Variables internas del workflow (solo CI):
  - `DATABASE_URL`, `DATABASE_URL_TEST`, `SHADOW_DATABASE_URL`
  - `REDIS_URL`, `APP_ENV`, `NODE_ENV`, `THROTTLE_ENABLED`
- Nota GitGuardian:
  - El usuario/password de Postgres en CI no es prod; marcar el alerta como resolved/ignored en GitGuardian si es necesario.
