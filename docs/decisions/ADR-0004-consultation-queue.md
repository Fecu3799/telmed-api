# ADR-0004 Consultation queue

## Context
Necesitamos separar la agenda (appointments) del registro clinico (consultations) y agregar una sala de espera para coordinar el ingreso.

## Decision
- Mantener Appointment como agenda.
- Mantener Consultation como registro clinico asociado a un appointment.
- Agregar ConsultationQueueItem para sala de espera y transiciones a consultation.

## Consequences
- La logica de sala de espera vive separada del appointment.
- Se habilita control de ingreso (aceptar/rechazar/cancelar/expirar) antes de iniciar la consulta.
