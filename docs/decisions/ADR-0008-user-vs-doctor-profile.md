# ADR-0008 User vs DoctorProfile ownership

## What it does
- Separa responsabilidades: `User` es cuenta/auth; `DoctorProfile` es el aggregate root del dominio doctor.
- Todas las relaciones doctor-only cuelgan de `DoctorProfile` (no de `User`).

## How it works
- `DoctorProfile` usa `user_id` como PK y relación 1:1 con `User`.
- Relaciones doctor-only bajo `DoctorProfile`:
  - `DoctorAvailabilityRule`
  - `DoctorAvailabilityException`
  - `DoctorSchedulingConfig`
  - `DoctorPaymentAccount`
- FKs de esas tablas apuntan a `doctor_profiles.user_id`.
- Ejemplos de query (Prisma):
  - `prisma.doctorProfile.findUnique({ where: { userId }, include: { availabilityRules: true, availabilityExceptions: true, schedulingConfig: true, doctorPaymentAccount: true } })`
  - `prisma.doctorAvailabilityRule.findMany({ where: { userId } })`

## Gotchas
- Si es configuracion/estado operativo del doctor, va en `DoctorProfile` (no en `User`).
- Las migraciones backfill crean perfiles minimos (`price_cents = 0`, `is_active = false`) para doctores con data doctor-only sin perfil.
- Los PUT/PATCH de perfil reactivan (`is_active = true`) para habilitar booking/visibilidad cuando el perfil se completa.
