# Test Helpers

## Cómo preparar la base de datos de tests

Los tests e2e requieren una base de datos separada (`med_test`) para evitar pérdida de datos en la base de datos de desarrollo.

### Crear la base de datos de tests

Desde la raíz del repositorio (donde está `docker-compose.yml`), ejecuta:

```bash
docker compose exec -T db psql -U app -d postgres -c "SELECT 'CREATE DATABASE med_test' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'med_test')\\gexec"
```

Este comando es idempotente: si la base de datos ya existe, no falla.

### Aplicar migraciones a la base de datos de tests

```bash
DATABASE_URL=postgresql://app:app@localhost:5432/med_test?schema=public npx prisma migrate deploy
```

O usando Prisma directamente:

```bash
DATABASE_URL=postgresql://app:app@localhost:5432/med_test?schema=public npx prisma db push
```

### Configurar variables de entorno

Copia `.env.test.example` a `.env.test` y ajusta si es necesario:

```bash
cp .env.test.example .env.test
```

El archivo `.env.test` ya tiene los valores por defecto correctos, así que normalmente no necesitas modificarlo.

### Verificar que todo funciona

```bash
npm run test:e2e
```

## Convenciones

- **Desarrollo**: `DATABASE_URL` → `postgresql://app:app@localhost:5432/med?schema=public`
- **Tests e2e**: `DATABASE_URL_TEST` → `postgresql://app:app@localhost:5432/med_test?schema=public`

El helper `ensureTestEnv()` valida que `DATABASE_URL_TEST` esté configurada y sea diferente de `DATABASE_URL` para prevenir pérdida de datos.
