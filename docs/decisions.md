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
