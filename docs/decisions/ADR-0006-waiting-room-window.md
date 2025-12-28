# ADR-0006 Waiting room window

## Contexto
- Evitar accesos fuera de horario a la sala.
- Necesitamos fairness en el orden de espera.
- El soporte requiere reglas claras para excepciones.

## Decision
- Ventana de acceso: `now` en `[startAt - 15min, startAt + 15min]` cuando hay appointmentId.
- Orden por defecto: appointment.startAt asc y queuedAt asc; si no hay appointmentId, queuedAt asc.
- Override: doctor/admin pueden aceptar manualmente cualquier item.
- Estado post-ventana: `missed`/`no_show`/`expired` queda pendiente de implementacion.

## Consequences
- Menos bugs de horario y UX clara para pacientes.
- Orden de espera consistente para el equipo medico.
- Se habilita excepcion manual sin romper la regla base.
