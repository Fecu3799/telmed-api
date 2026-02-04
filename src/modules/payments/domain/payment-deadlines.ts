const APPOINTMENT_IMMEDIATE_TTL_MINUTES = 10;
const EMERGENCY_TTL_MINUTES = 10;

/**
 * Appointment payment deadline.
 * What it does:
 * - Applies the 24h rule to decide between immediate TTL or prior-day 20:00.
 * How it works:
 * - Uses runtime local timezone (Argentina) for the 20:00 cutoff.
 */
export function computeAppointmentPaymentDeadline(input: {
  now: Date;
  appointmentStartsAt: Date;
}): Date {
  const diffMs = input.appointmentStartsAt.getTime() - input.now.getTime();
  const twentyFourHoursMs = 24 * 60 * 60 * 1000;

  if (diffMs < twentyFourHoursMs) {
    return new Date(
      input.now.getTime() + APPOINTMENT_IMMEDIATE_TTL_MINUTES * 60 * 1000,
    );
  }

  const startsAt = input.appointmentStartsAt;
  const deadline = new Date(
    startsAt.getFullYear(),
    startsAt.getMonth(),
    startsAt.getDate(),
    20,
    0,
    0,
    0,
  );
  deadline.setDate(deadline.getDate() - 1);
  return deadline;
}

export function computeEmergencyPaymentDeadline(now: Date): Date {
  return new Date(now.getTime() + EMERGENCY_TTL_MINUTES * 60 * 1000);
}

export function computeTimeLeftSeconds(deadline: Date, now: Date): number {
  const diffMs = deadline.getTime() - now.getTime();
  return Math.max(0, Math.floor(diffMs / 1000));
}
