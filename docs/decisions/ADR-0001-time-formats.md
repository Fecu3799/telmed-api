# ADR-0001 Time formats

## Contexto
El frontend consume disponibilidad y crea turnos. Necesitamos una convencion clara de formatos para evitar errores por zona horaria.

## Decision
- Availability GET `/api/v1/doctors/:doctorUserId/availability`:
  - La UI trabaja con rango de fechas `YYYY-MM-DD`.
  - El request usa ISO UTC en query params: `from` y `to` (ej: `2025-01-05T00:00:00.000Z`).
  - La respuesta devuelve slots `startAt` y `endAt` en ISO UTC con `Z`.
- Appointments POST `/api/v1/appointments`:
  - `startAt` es ISO UTC y debe coincidir con un slot.
- Listados de appointments:
  - `from` y `to` son ISO UTC obligatorios.

## Consecuencias
- El frontend debe convertir fechas locales a ISO UTC antes de llamar a la API.
- Los mensajes de error 422 por rango/lead time deben mostrarse con claridad (ej: "fuera de rango permitido").
