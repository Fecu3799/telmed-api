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
import { getSpecialties, type Specialty } from '../api/specialties';
import {
  createGeoEmergency,
  getNearbyDoctors,
  type GeoNearbyDoctor,
} from '../api/geo';
import { type ProblemDetails } from '../api/http';
import { initLeafletIcons } from '../utils/leaflet';
import {
  getStoredPatientLocation,
  setStoredPatientLocation,
} from '../utils/patient-location';

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
      map.setView(position, map.getZoom() || 12);
    }
  }, [map, position]);
  return null;
}

export function GeoNearbyPage() {
  const navigate = useNavigate();
  const { getActiveToken } = useAuth();
  const [location, setLocation] = useState<LatLngLiteral | null>(null);
  const [radiusMeters, setRadiusMeters] = useState(5000);
  const [specialtyId, setSpecialtyId] = useState('');
  const [maxPriceCents, setMaxPriceCents] = useState<string>('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [doctors, setDoctors] = useState<GeoNearbyDoctor[]>([]);
  const [pageInfo, setPageInfo] = useState({
    hasNextPage: false,
    hasPrevPage: false,
  });
  const [selectedDoctors, setSelectedDoctors] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<ProblemDetails | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [lastEmergencyRequest, setLastEmergencyRequest] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [lastEmergencyResponse, setLastEmergencyResponse] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [lastEmergencyError, setLastEmergencyError] =
    useState<ProblemDetails | null>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    initLeafletIcons();
    const stored = getStoredPatientLocation();
    if (stored) {
      setLocation(stored);
    }
  }, []);

  useEffect(() => {
    const loadSpecialties = async () => {
      try {
        const data = await getSpecialties(100);
        setSpecialties(data);
      } catch {
        setSpecialties([]);
      }
    };
    void loadSpecialties();
  }, []);

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

  const handleSelectSearch = (result: NominatimResult) => {
    const lat = Number(result.lat);
    const lng = Number(result.lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;
    const nextLocation = { lat, lng };
    setLocation(nextLocation);
    setStoredPatientLocation(nextLocation);
    setSearchResults([]);
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setError({ status: 422, detail: 'Geolocalización no disponible' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nextLocation = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setLocation(nextLocation);
        setStoredPatientLocation(nextLocation);
        setError(null);
      },
      () => {
        setError({ status: 422, detail: 'No se pudo obtener la ubicación' });
      },
      { enableHighAccuracy: true, timeout: 5000 },
    );
  };

  const handleSearch = async (nextPage = 1) => {
    if (!getActiveToken()) return;
    if (!location) {
      setError({ status: 422, detail: 'Selecciona una ubicación' });
      return;
    }
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await getNearbyDoctors({
        lat: location.lat,
        lng: location.lng,
        radiusMeters,
        specialtyId: specialtyId || undefined,
        maxPriceCents: maxPriceCents ? Number(maxPriceCents) : undefined,
        page: nextPage,
        pageSize,
      });
      setDoctors(response.items);
      setPage(nextPage);
      setPageInfo(response.pageInfo);
    } catch (err) {
      const apiError = err as {
        problemDetails?: ProblemDetails;
        status?: number;
      };
      if (apiError.problemDetails) {
        console.error(
          '[geo] nearby failed:',
          apiError.problemDetails.title,
          apiError.problemDetails.detail,
        );
      }
      setError(
        apiError.problemDetails || {
          status: apiError.status || 500,
          detail: 'No se pudo buscar doctores cercanos',
        },
      );
      setDoctors([]);
      setPageInfo({ hasNextPage: false, hasPrevPage: false });
    } finally {
      setLoading(false);
    }
  };

  const toggleDoctor = (doctorId: string) => {
    setSelectedDoctors((prev) => {
      if (prev.includes(doctorId)) {
        return prev.filter((id) => id !== doctorId);
      }
      if (prev.length >= 3) {
        return prev;
      }
      return [...prev, doctorId];
    });
  };

  const handleSendEmergency = async () => {
    if (!location) {
      setError({ status: 422, detail: 'Selecciona una ubicación' });
      return;
    }
    if (selectedDoctors.length === 0) {
      setError({ status: 422, detail: 'Selecciona al menos un médico' });
      return;
    }
    if (!note.trim()) {
      setError({ status: 422, detail: 'Ingresá un motivo' });
      return;
    }
    setSending(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const requestPayload = {
        doctorIds: selectedDoctors,
        patientLocation: { lat: location.lat, lng: location.lng },
        note: note.trim(),
      };
      const response = await createGeoEmergency({
        doctorIds: selectedDoctors,
        patientLocation: { lat: location.lat, lng: location.lng },
        note: note.trim(),
      });
      setLastEmergencyRequest(requestPayload);
      setLastEmergencyResponse(response);
      setLastEmergencyError(null);
      setSuccessMessage(`Emergencia enviada (grupo ${response.groupId})`);
      setSelectedDoctors([]);
    } catch (err) {
      const apiError = err as {
        problemDetails?: ProblemDetails;
        status?: number;
      };
      if (apiError.problemDetails) {
        console.error(
          '[geo] emergency failed:',
          apiError.problemDetails.title,
          apiError.problemDetails.detail,
        );
      }
      const fallbackError = apiError.problemDetails || {
        status: apiError.status || 500,
        detail: 'No se pudo enviar la emergencia',
      };
      setLastEmergencyRequest({
        doctorIds: selectedDoctors,
        patientLocation: { lat: location.lat, lng: location.lng },
        note: note.trim(),
      });
      setLastEmergencyResponse(null);
      setLastEmergencyError(fallbackError);
      setError(fallbackError);
    } finally {
      setSending(false);
    }
  };

  const canSelectMore = selectedDoctors.length < 3;

  return (
    <div style={{ padding: '16px', maxWidth: '1200px', margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}
      >
        <h1 style={{ margin: 0 }}>Doctores cerca</h1>
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

      {successMessage && (
        <div
          style={{
            marginBottom: '16px',
            padding: '12px',
            backgroundColor: '#e6f7ea',
            border: '1px solid #b5e3c1',
            borderRadius: '4px',
            color: '#2a7a3b',
          }}
        >
          {successMessage}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(280px, 1fr) 2fr',
          gap: '16px',
          marginBottom: '16px',
        }}
      >
        <div
          style={{
            border: '1px solid #ddd',
            borderRadius: '8px',
            padding: '16px',
            backgroundColor: 'white',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px',
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 0 }}>
              Ubicación del paciente
            </h3>
            <button
              onClick={() => setShowDebug((value) => !value)}
              style={{
                padding: '6px 10px',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              {showDebug ? 'Ocultar debug' : 'Debug'}
            </button>
          </div>
          <button
            onClick={handleUseMyLocation}
            style={{
              width: '100%',
              padding: '8px 12px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              marginBottom: '12px',
            }}
          >
            Usar mi ubicación
          </button>
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

          <div style={{ marginTop: '12px' }}>
            <label style={{ display: 'block', marginBottom: '6px' }}>
              Radio (km)
            </label>
            <input
              type="range"
              min={1000}
              max={10000}
              step={500}
              value={radiusMeters}
              onChange={(event) => setRadiusMeters(Number(event.target.value))}
              style={{ width: '100%' }}
            />
            <div>{(radiusMeters / 1000).toFixed(1)} km</div>
          </div>

          <div style={{ marginTop: '12px' }}>
            <label style={{ display: 'block', marginBottom: '6px' }}>
              Especialidad
            </label>
            <select
              value={specialtyId}
              onChange={(event) => setSpecialtyId(event.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid #ccc',
              }}
            >
              <option value="">Todas</option>
              {specialties.map((specialty) => (
                <option key={specialty.id} value={specialty.id}>
                  {specialty.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginTop: '12px' }}>
            <label style={{ display: 'block', marginBottom: '6px' }}>
              Precio máximo (centavos)
            </label>
            <input
              type="number"
              value={maxPriceCents}
              onChange={(event) => setMaxPriceCents(event.target.value)}
              placeholder="Ej: 150000"
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid #ccc',
              }}
            />
          </div>

          <button
            onClick={() => void handleSearch(1)}
            style={{
              width: '100%',
              padding: '10px 16px',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              marginTop: '16px',
            }}
          >
            Buscar doctores
          </button>
        </div>

        <div style={{ borderRadius: '8px', overflow: 'hidden' }}>
          <MapContainer
            center={location ?? { lat: -34.6037, lng: -58.3816 }}
            zoom={12}
            style={{ height: '520px', width: '100%' }}
          >
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <RecenterMap position={location} />
            <LocationMarker
              position={location}
              onSelect={(nextLocation) => {
                setLocation(nextLocation);
                setStoredPatientLocation(nextLocation);
              }}
            />
          </MapContainer>
        </div>
      </div>

      <div
        style={{
          border: '1px solid #ddd',
          borderRadius: '8px',
          padding: '16px',
          backgroundColor: 'white',
        }}
      >
        <h3 style={{ marginTop: 0 }}>Resultados</h3>
        {loading ? (
          <div>Cargando...</div>
        ) : doctors.length === 0 ? (
          <div>No hay doctores cercanos con los filtros actuales.</div>
        ) : (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: '16px',
              }}
            >
              {doctors.map((doctor) => {
                const displayName =
                  doctor.displayName ||
                  (doctor.firstName && doctor.lastName
                    ? `${doctor.firstName} ${doctor.lastName}`
                    : doctor.firstName || doctor.lastName || 'Doctor');

                return (
                  <div
                    key={doctor.doctorUserId}
                    style={{
                      border: '1px solid #eee',
                      borderRadius: '8px',
                      padding: '12px',
                    }}
                  >
                    <strong>{displayName}</strong>
                    <div style={{ color: '#666', marginTop: '6px' }}>
                      {doctor.specialties.map((s) => s.name).join(', ') ||
                        'Sin especialidad'}
                    </div>
                    <div style={{ marginTop: '6px' }}>
                      Precio: {(doctor.priceCents / 100).toFixed(2)}{' '}
                      {doctor.currency}
                    </div>
                    <div style={{ marginTop: '6px' }}>
                      Distancia: {(doctor.distanceMeters / 1000).toFixed(2)} km
                    </div>
                    <div style={{ marginTop: '6px', color: '#666' }}>
                      {doctor.city || doctor.region
                        ? [doctor.city, doctor.region]
                            .filter(Boolean)
                            .join(', ')
                        : 'Ubicación no disponible'}
                    </div>
                    <div
                      style={{ marginTop: '10px', display: 'flex', gap: '8px' }}
                    >
                      <button
                        onClick={() =>
                          navigate(`/doctor-profile/${doctor.doctorUserId}`)
                        }
                        style={{
                          flex: 1,
                          padding: '8px',
                          borderRadius: '4px',
                          border: 'none',
                          backgroundColor: '#007bff',
                          color: 'white',
                          cursor: 'pointer',
                        }}
                      >
                        Ver perfil
                      </button>
                      <button
                        onClick={() => toggleDoctor(doctor.doctorUserId)}
                        disabled={
                          !canSelectMore &&
                          !selectedDoctors.includes(doctor.doctorUserId)
                        }
                        style={{
                          flex: 1,
                          padding: '8px',
                          borderRadius: '4px',
                          border: 'none',
                          backgroundColor: selectedDoctors.includes(
                            doctor.doctorUserId,
                          )
                            ? '#dc3545'
                            : '#28a745',
                          color: 'white',
                          cursor: 'pointer',
                        }}
                      >
                        {selectedDoctors.includes(doctor.doctorUserId)
                          ? 'Quitar'
                          : 'Seleccionar'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '16px',
              }}
            >
              <button
                onClick={() => void handleSearch(page - 1)}
                disabled={!pageInfo.hasPrevPage}
                style={{
                  padding: '8px 16px',
                  backgroundColor: pageInfo.hasPrevPage ? '#6c757d' : '#ccc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: pageInfo.hasPrevPage ? 'pointer' : 'not-allowed',
                }}
              >
                Anterior
              </button>
              <span>Página {page}</span>
              <button
                onClick={() => void handleSearch(page + 1)}
                disabled={!pageInfo.hasNextPage}
                style={{
                  padding: '8px 16px',
                  backgroundColor: pageInfo.hasNextPage ? '#007bff' : '#ccc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: pageInfo.hasNextPage ? 'pointer' : 'not-allowed',
                }}
              >
                Siguiente
              </button>
            </div>
          </>
        )}
      </div>

      {selectedDoctors.length > 0 && (
        <div
          style={{
            marginTop: '16px',
            border: '1px solid #ddd',
            borderRadius: '8px',
            padding: '16px',
            backgroundColor: 'white',
          }}
        >
          <h3 style={{ marginTop: 0 }}>Enviar emergencia</h3>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Motivo breve..."
            rows={3}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #ccc',
            }}
          />
          <div style={{ marginTop: '12px', color: '#666' }}>
            Seleccionados: {selectedDoctors.length} / 3
          </div>
          <button
            onClick={() => void handleSendEmergency()}
            disabled={sending || !note.trim()}
            style={{
              marginTop: '12px',
              padding: '10px 16px',
              backgroundColor: sending || !note.trim() ? '#ccc' : '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: sending || !note.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {sending ? 'Enviando...' : 'Enviar emergencia'}
          </button>
        </div>
      )}

      {showDebug && (
        <div
          style={{
            marginTop: '16px',
            padding: '12px',
            backgroundColor: '#f8f9fa',
            border: '1px solid #dee2e6',
            borderRadius: '4px',
          }}
        >
          <strong>Debug envio emergencia</strong>
          <pre
            style={{
              marginTop: '8px',
              padding: '8px',
              backgroundColor: '#fff',
              border: '1px solid #eee',
              borderRadius: '4px',
              whiteSpace: 'pre-wrap',
            }}
          >
            {JSON.stringify(
              {
                request: lastEmergencyRequest,
                response: lastEmergencyResponse,
                error: lastEmergencyError,
              },
              null,
              2,
            )}
          </pre>
        </div>
      )}
    </div>
  );
}
