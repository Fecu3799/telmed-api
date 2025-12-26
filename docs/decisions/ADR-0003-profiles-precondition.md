# ADR-0003 Profiles precondition

## Contexto
Los turnos requieren datos de DoctorProfile y PatientProfile para validar disponibilidad y ownership.

## Decision
- Para operar disponibilidad y turnos se exige:
  - DoctorProfile existente y activo para el medico.
  - PatientProfile existente para el paciente.

## Consecuencias
- El frontend debe crear el perfil correspondiente antes de reservar.
- Si falta el perfil, la API responde 404 (Doctor not found / Patient not found).
