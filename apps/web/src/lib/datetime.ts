const ARG_TZ = 'America/Argentina/Buenos_Aires';

/**
 * Format ISO datetime to Argentina local string (dd/MM/yyyy, HH:mm hs).
 */
export function formatArgentinaDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const formatted = date.toLocaleString('es-AR', {
    timeZone: ARG_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  return `${formatted} hs`;
}
