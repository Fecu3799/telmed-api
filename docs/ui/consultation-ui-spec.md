# Consultation UI Spec (Waiting Room)

## Patient - Entrar a sala
- Mostrar boton "Entrar a sala" solo si `now` esta dentro de la ventana `[startAt - 15min, startAt + 15min]`.
- Fuera de ventana, ocultar el boton y mostrar mensaje de estado (muy temprano / demasiado tarde).
- Emergencia: mostrar boton "Pagar" solo si `status=accepted` y `paymentStatus=pending`.

## Doctor - Sala de espera
- Orden por defecto:
  - con appointmentId: appointment.startAt asc, luego queuedAt asc.
  - sin appointmentId: queuedAt asc.
- El doctor puede aceptar manualmente cualquier item sin respetar el orden.
- Emergencia: el doctor primero acepta (habilita pago), luego inicia la consulta cuando `paymentStatus=paid`.
