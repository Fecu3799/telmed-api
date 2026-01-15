import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import type { LatLngLiteral, LeafletMouseEvent } from 'leaflet';
import { useAuth } from '../auth/AuthContext';
import { getDoctorProfile, type DoctorProfile } from '../api/doctor-profile';
import { goOffline, goOnline, pingOnline, setDoctorLocation } from '../api/geo';
import { type ProblemDetails } from '../api/http';
import { initLeafletIcons } from '../utils/leaflet';

type NominatimResult = {
  display_name: string;
  lat: string;
  lon: string;
};

function LocationMarker({
  position,
  onSelect,
}: {
  position: LatLngLiteral | null;
  onSelect: (position: LatLngLiteral) => void;
}) {
  useMapEvents({
    click(event: LeafletMouseEvent) {
      onSelect(event.latlng);
    },
  });
  return position ? <Marker position={position} /> : null;
}

function RecenterMap({ position }: { position: LatLngLiteral | null }) {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.setView(position, map.getZoom() || 13);
    }
  }, [map, position]);
  return null;
}

export function DoctorLocationPage() {
  const navigate = useNavigate();
  const { getActiveToken } = useAuth();
  const [profile, setProfile] = useState<DoctorProfile | null>(null);
  const [location, setLocation] = useState<LatLngLiteral | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [presenceLoading, setPresenceLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [error, setError] = useState<ProblemDetails | null>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    initLeafletIcons();
  }, []);

  useEffect(() => {
    const loadProfile = async () => {
      if (!getActiveToken()) return;
      setLoadingProfile(true);
      setError(null);
      try {
        const data = await getDoctorProfile();
        setProfile(data);
        if (data.location) {
          setLocation({ lat: data.location.lat, lng: data.location.lng });
        }
      } catch (err) {
        const apiError = err as {
          problemDetails?: ProblemDetails;
          status?: number;
        };
        if (apiError.problemDetails) {
          console.error(
            '[geo] profile load failed:',
            apiError.problemDetails.title,
            apiError.problemDetails.detail,
          );
        }
        setError(
          apiError.problemDetails || {
            status: apiError.status || 500,
            detail: 'No se pudo cargar el perfil',
          },
        );
      } finally {
        setLoadingProfile(false);
      }
    };
    void loadProfile();
  }, [getActiveToken]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = window.setTimeout(async () => {
      try {
        const url = new URL('https://nominatim.openstreetmap.org/search');
        url.searchParams.set('format', 'jsonv2');
        url.searchParams.set('q', searchQuery.trim());
        url.searchParams.set('limit', '5');
        const response = await fetch(url.toString(), {
          headers: { 'Accept-Language': 'es' },
        });
        if (!response.ok) {
          setSearchResults([]);
          return;
        }
        const results = (await response.json()) as NominatimResult[];
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      }
    }, 350);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchQuery]);

  useEffect(() => {
    if (!isOnline) return;

    const interval = window.setInterval(async () => {
      try {
        await pingOnline();
      } catch (err) {
        const apiError = err as {
          problemDetails?: ProblemDetails;
          status?: number;
        };
        if (apiError.problemDetails) {
          console.error(
            '[geo] ping failed:',
            apiError.problemDetails.title,
            apiError.problemDetails.detail,
          );
        }
        setError(
          apiError.problemDetails || {
            status: apiError.status || 500,
            detail: 'No se pudo mantener la presencia online',
          },
        );
        setIsOnline(false);
      }
    }, 25000);

    return () => clearInterval(interval);
  }, [isOnline]);

  const handleSelectSearch = (result: NominatimResult) => {
    const lat = Number(result.lat);
    const lng = Number(result.lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;
    setLocation({ lat, lng });
    setSearchResults([]);
  };

  const handleSaveLocation = async () => {
    if (!location) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await setDoctorLocation(location);
      setProfile(updated);
    } catch (err) {
      const apiError = err as {
        problemDetails?: ProblemDetails;
        status?: number;
      };
      if (apiError.problemDetails) {
        console.error(
          '[geo] location save failed:',
          apiError.problemDetails.title,
          apiError.problemDetails.detail,
        );
      }
      setError(
        apiError.problemDetails || {
          status: apiError.status || 500,
          detail: 'No se pudo guardar la ubicación',
        },
      );
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePresence = async () => {
    setPresenceLoading(true);
    setError(null);
    try {
      if (!isOnline) {
        await goOnline();
        setIsOnline(true);
      } else {
        await goOffline();
        setIsOnline(false);
      }
    } catch (err) {
      const apiError = err as {
        problemDetails?: ProblemDetails;
        status?: number;
      };
      if (apiError.problemDetails) {
        console.error(
          '[geo] presence update failed:',
          apiError.problemDetails.title,
          apiError.problemDetails.detail,
        );
      }
      setError(
        apiError.problemDetails || {
          status: apiError.status || 500,
          detail: 'No se pudo actualizar la presencia',
        },
      );
    } finally {
      setPresenceLoading(false);
    }
  };

  const cityRegion = profile
    ? [profile.city, profile.region].filter(Boolean).join(', ')
    : '';

  return (
    <div style={{ padding: '16px', maxWidth: '1100px', margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}
      >
        <h1 style={{ margin: 0 }}>Mi ubicación</h1>
        <button
          onClick={() => navigate('/lobby')}
          style={{
            padding: '8px 16px',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Volver al Lobby
        </button>
      </div>

      {error && (
        <div
          style={{
            marginBottom: '16px',
            padding: '12px',
            backgroundColor: '#fee',
            border: '1px solid #fcc',
            borderRadius: '4px',
            color: '#c33',
          }}
        >
          <strong>Error {error.status}:</strong> {error.detail}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(280px, 1fr) 2fr',
          gap: '16px',
        }}
      >
        <div
          style={{
            border: '1px solid #ddd',
            borderRadius: '8px',
            padding: '16px',
            backgroundColor: '#fff',
          }}
        >
          <h3 style={{ marginTop: 0 }}>Buscar dirección</h3>
          <input
            type="text"
            placeholder="Buscar dirección..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #ccc',
              marginBottom: '8px',
            }}
          />
          {searchResults.length > 0 && (
            <div style={{ border: '1px solid #eee', borderRadius: '4px' }}>
              {searchResults.map((result) => (
                <button
                  key={`${result.lat}-${result.lon}`}
                  onClick={() => handleSelectSearch(result)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px',
                    border: 'none',
                    backgroundColor: 'white',
                    borderBottom: '1px solid #eee',
                    cursor: 'pointer',
                  }}
                >
                  {result.display_name}
                </button>
              ))}
            </div>
          )}

          <div style={{ marginTop: '16px' }}>
            <button
              onClick={() => void handleSaveLocation()}
              disabled={!location || saving}
              style={{
                width: '100%',
                padding: '10px 16px',
                backgroundColor: location ? '#007bff' : '#ccc',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: location ? 'pointer' : 'not-allowed',
              }}
            >
              {saving ? 'Guardando...' : 'Guardar ubicación'}
            </button>
          </div>

          <div style={{ marginTop: '12px', color: '#555' }}>
            <div>
              <strong>Ciudad/Región:</strong>{' '}
              {loadingProfile ? 'Cargando...' : cityRegion || 'Sin datos'}
            </div>
            <div>
              <strong>País:</strong>{' '}
              {profile?.countryCode ??
                (loadingProfile ? 'Cargando...' : 'Sin datos')}
            </div>
          </div>

          <div style={{ marginTop: '16px' }}>
            <button
              onClick={() => void handleTogglePresence()}
              disabled={presenceLoading}
              style={{
                width: '100%',
                padding: '10px 16px',
                backgroundColor: isOnline ? '#dc3545' : '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              {presenceLoading
                ? 'Actualizando...'
                : isOnline
                  ? 'Pasar offline'
                  : 'Pasar online'}
            </button>
          </div>
        </div>

        <div style={{ borderRadius: '8px', overflow: 'hidden' }}>
          <MapContainer
            center={location ?? { lat: -34.6037, lng: -58.3816 }}
            zoom={13}
            style={{ height: '520px', width: '100%' }}
          >
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <RecenterMap position={location} />
            <LocationMarker position={location} onSelect={setLocation} />
          </MapContainer>
        </div>
      </div>
    </div>
  );
}
