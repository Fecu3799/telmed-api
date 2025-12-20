# TelMed-API (MVP) — Backend

Backend (API-only) para una plataforma de telemedicina donde:

- **Médicos** se registran y ofrecen servicios (especialidad, precio, perfil, ubicación).
- **Pacientes** buscan médicos por **cercanía (PostGIS)**, especialidad, precio, etc.
- Se agenda una primera consulta por videollamada (Zoom/Meet) y se cobra vía pasarela (MercadoPago u otra).
- Chat privado médico–paciente post-consulta (MVP: base).

> En esta etapa: **solo backend local**. Frontend, HTTPS, reverse proxy, etc. se integran después.

---

## Alcance MVP (primera etapa)

- Auth (registro/login) para roles `patient | doctor | admin`
- Perfiles:
  - Doctor: displayName, bio, especialidades, precio, currency, estado de verificación, ubicación (PostGIS)
  - Patient: perfil básico
- Búsqueda de médicos:
  - por cercanía (lat/lng + radio)
  - por especialidad
  - por rango de precio
  - orden por distancia/precio
- Turnos (base): creación y estados mínimos
- Pagos (base): iniciar pago + webhook (mock inicialmente)
- Chat (base): conversaciones y mensajes (MVP)

**Fuera del MVP (por ahora):**

- Historia clínica completa, recetas, adjuntos sensibles, e-commerce, multi-sede avanzada, analítica.

---

## Stack

- Node.js + TypeScript
- NestJS
- PostgreSQL + **PostGIS**
- Redis (sesiones, rate-limit, colas futuras)
- Prisma (ORM) + migraciones
- Docker Compose (local)
- Jest (tests)

---

## Estructura del repo (esperada)

- `src/`
  - `modules/` (auth, users, doctor-profiles, patient-profiles, search, appointments, payments, chat)
  - `common/` (filters, guards, interceptors, pipes, dto, errors)
  - `infra/` (db/prisma, redis, config, logging)
- `prisma/`
  - `schema.prisma`
  - `migrations/`
- `docker-compose.yml`
- `.env`

---

## Cómo correr local

### 1) Infra (DB + Redis)

```bash
docker compose up -d
docker ps

---

## Tests e2e

Para ejecutar `npm run test:e2e`, configurar una base de datos separada:

- Crear `.env.test` con `DATABASE_URL_TEST=postgresql://...`
- Los tests usan `DATABASE_URL_TEST` si existe (fallback a `DATABASE_URL`)





Reglas de migraciones (IMPORTANTE: PostGIS)

En este proyecto hay columnas PostGIS no tipadas por Prisma (ej: location geography(Point,4326)).

Regla:

Para PostGIS/Unsupported: NO depender de autogenerado de prisma migrate dev.

Crear migración SQL:

npx prisma migrate dev --create-only --name <name>

Editar migration.sql e incluir:

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;

DDL de geography(...) + índice GiST

Aplicar preferentemente con:

npx prisma migrate deploy (o SQL directo local si hace falta)

No borrar migraciones una vez que haya datos reales / producción.



Guía para Codex (reglas de generación de código)

Cuando generes/edites código en este repo:

Respetar NestJS modular: module -> controller -> service -> repo/prisma

DTOs con validación (class-validator) + pipes

Errores con Problem Details (filtro global)

Endpoints siempre bajo /api/v1

Auth desacoplado: guards inyectan actor

RBAC por roles (patient|doctor|admin) + ownership checks

UUIDs como string

No usar Prisma para “crear” geography; usar migración SQL y queryRaw

Mantener compatibilidad macOS + Docker local

Preferir cambios chicos, testeables, con comandos de verificación
```
