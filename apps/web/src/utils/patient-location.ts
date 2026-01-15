const STORAGE_KEY = 'telmed.patientLocation';

export type StoredLocation = { lat: number; lng: number };

export function getStoredPatientLocation(): StoredLocation | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredLocation;
    if (
      typeof parsed?.lat !== 'number' ||
      Number.isNaN(parsed.lat) ||
      typeof parsed?.lng !== 'number' ||
      Number.isNaN(parsed.lng)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setStoredPatientLocation(location: StoredLocation | null) {
  try {
    if (!location) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(location));
  } catch {
    // Ignore storage failures.
  }
}
