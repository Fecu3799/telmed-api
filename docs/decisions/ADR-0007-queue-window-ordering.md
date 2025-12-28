# ADR-0007 Queue window and ordering

## Contexto
- Evitar accesos fuera de horario a la sala de espera.
- Necesitamos fairness en el orden de espera.
- Soporte requiere reglas claras y consistentes.

## Decision
- Ventana de acceso para appointment: `now` dentro de `[startAt - 15min, startAt + 15min]`.
- Orden por defecto: appointment.startAt asc y queuedAt asc.
- Override: doctor/admin pueden aceptar manualmente cualquier item.

## Consequences
- Menos errores por timing y UX mas clara.
- Cola consistente para el equipo medico.
- Regla sencilla para soporte y auditoria.
