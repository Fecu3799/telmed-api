import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  searchDoctors,
  type DoctorSearchItem,
  type DoctorSearchParams,
} from '../api/doctor-search';
import { getSpecialties, type Specialty } from '../api/specialties';
import { type ProblemDetails } from '../api/http';

export function DoctorSearchPage() {
  const navigate = useNavigate();
  const { getActiveToken } = useAuth();

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSpecialtyId, setSelectedSpecialtyId] = useState<string>('');
  const [doctors, setDoctors] = useState<DoctorSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ProblemDetails | null>(null);

  // Pagination state (cursor-based, but we track "page" conceptually)
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [currentCursor, setCurrentCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]); // Track cursor history for "previous"
  const pageSize = 5;

  // Specialties state
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [loadingSpecialties, setLoadingSpecialties] = useState(false);

  // Debounce ref for search query
  const debounceTimerRef = useRef<number | null>(null);

  // Load specialties on mount
  useEffect(() => {
    const loadSpecialties = async () => {
      setLoadingSpecialties(true);
      try {
        const data = await getSpecialties(100);
        setSpecialties(data);
      } catch (err) {
        // Ignore errors for specialties (optional feature)
        if (import.meta.env.DEV) {
          console.error('Failed to load specialties:', err);
        }
      } finally {
        setLoadingSpecialties(false);
      }
    };
    void loadSpecialties();
  }, []);

  // Perform search
  const performSearch = async (
    cursor: string | null = null,
    resetHistory = false,
  ) => {
    if (!getActiveToken()) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params: DoctorSearchParams = {
        limit: pageSize,
        cursor: cursor || undefined,
      };

      if (searchQuery.trim()) {
        params.q = searchQuery.trim();
      }
      if (selectedSpecialtyId) {
        params.specialtyId = selectedSpecialtyId;
      }

      const response = await searchDoctors(params);
      setDoctors(response.items);
      setNextCursor(response.pageInfo.nextCursor);

      if (resetHistory) {
        setCursorHistory([]);
        setCurrentCursor(null);
      } else if (cursor) {
        setCurrentCursor(cursor);
      }
    } catch (err) {
      const apiError = err as {
        problemDetails?: ProblemDetails;
        status?: number;
      };
      if (apiError.problemDetails) {
        setError(apiError.problemDetails);
      } else {
        setError({
          status: apiError.status || 500,
          detail: 'Error al buscar médicos',
        });
      }
      setDoctors([]);
      setNextCursor(null);
    } finally {
      setLoading(false);
    }
  };

  // Debounced search when query changes
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = window.setTimeout(() => {
      void performSearch(null, true);
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchQuery, selectedSpecialtyId]);

  // Handle specialty change
  const handleSpecialtyChange = (specialtyId: string) => {
    setSelectedSpecialtyId(specialtyId);
    // Reset pagination when filter changes
    setCursorHistory([]);
    setCurrentCursor(null);
  };

  // Handle next page
  const handleNext = () => {
    if (nextCursor) {
      setCursorHistory([...cursorHistory, currentCursor || '']);
      void performSearch(nextCursor, false);
    }
  };

  // Handle previous page
  const handlePrevious = () => {
    if (cursorHistory.length > 0) {
      const previousCursor = cursorHistory[cursorHistory.length - 1];
      setCursorHistory(cursorHistory.slice(0, -1));
      void performSearch(previousCursor || null, false);
    } else {
      // Go to first page
      void performSearch(null, true);
    }
  };

  // Handle view profile - navigate to doctor profile page
  const handleViewProfile = (doctor: DoctorSearchItem) => {
    // Navigate to doctor profile page with doctor info in state
    navigate(`/doctor-profile/${doctor.doctorUserId}`, {
      state: { doctor },
    });
  };

  // Check if 401/403 -> redirect to login
  useEffect(() => {
    if (error && (error.status === 401 || error.status === 403)) {
      navigate('/login');
    }
  }, [error, navigate]);

  const canGoNext = nextCursor !== null;
  const canGoPrevious = cursorHistory.length > 0 || currentCursor !== null;

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
        <h1 style={{ margin: 0 }}>Buscar Médicos</h1>
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

      {/* Filters */}
      <div
        style={{
          marginBottom: '24px',
          padding: '16px',
          backgroundColor: '#f5f5f5',
          borderRadius: '4px',
        }}
      >
        <div style={{ marginBottom: '16px' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '8px',
              fontWeight: 'bold',
            }}
          >
            Nombre
          </label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nombre..."
            style={{
              width: '100%',
              maxWidth: '400px',
              padding: '8px',
              border: '1px solid #ccc',
              borderRadius: '4px',
            }}
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '8px',
              fontWeight: 'bold',
            }}
          >
            Especialidad
          </label>
          <select
            value={selectedSpecialtyId}
            onChange={(e) => handleSpecialtyChange(e.target.value)}
            style={{
              width: '100%',
              maxWidth: '400px',
              padding: '8px',
              border: '1px solid #ccc',
              borderRadius: '4px',
            }}
          >
            <option value="">Todas las especialidades</option>
            {specialties.map((specialty) => (
              <option key={specialty.id} value={specialty.id}>
                {specialty.name}
              </option>
            ))}
          </select>
          {loadingSpecialties && (
            <span style={{ marginLeft: '8px', color: '#666' }}>
              Cargando...
            </span>
          )}
        </div>
      </div>

      {/* Error state */}
      {error && error.status !== 401 && error.status !== 403 && (
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

      {/* Loading state */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '24px' }}>Cargando...</div>
      )}

      {/* Empty state */}
      {!loading && doctors.length === 0 && !error && (
        <div
          style={{
            textAlign: 'center',
            padding: '48px',
            color: '#666',
          }}
        >
          No se encontraron médicos. Intenta cambiar los filtros de búsqueda.
        </div>
      )}

      {/* Results */}
      {!loading && doctors.length > 0 && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '16px',
              marginBottom: '24px',
            }}
          >
            {doctors.map((doctor) => {
              const displayName =
                doctor.displayName ||
                (doctor.firstName && doctor.lastName
                  ? `${doctor.firstName} ${doctor.lastName}`
                  : doctor.firstName || doctor.lastName || 'Doctor');

              const priceDisplay = new Intl.NumberFormat('es-AR', {
                style: 'currency',
                currency: doctor.currency || 'ARS',
              }).format(doctor.priceCents / 100);

              return (
                <div
                  key={doctor.doctorUserId}
                  style={{
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    padding: '16px',
                    backgroundColor: 'white',
                  }}
                >
                  <h3 style={{ marginTop: 0, marginBottom: '8px' }}>
                    {displayName}
                  </h3>

                  {doctor.specialties && doctor.specialties.length > 0 && (
                    <div style={{ marginBottom: '8px', color: '#666' }}>
                      {doctor.specialties.map((s) => s.name).join(', ')}
                    </div>
                  )}

                  <div style={{ marginBottom: '8px' }}>
                    <strong>Precio:</strong> {priceDisplay}
                  </div>

                  {doctor.distanceMeters !== null &&
                    doctor.distanceMeters !== undefined && (
                      <div style={{ marginBottom: '8px', color: '#666' }}>
                        Distancia: {(doctor.distanceMeters / 1000).toFixed(2)}{' '}
                        km
                      </div>
                    )}

                  <button
                    onClick={() => handleViewProfile(doctor)}
                    style={{
                      width: '100%',
                      padding: '8px 16px',
                      backgroundColor: '#007bff',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      marginTop: '8px',
                    }}
                  >
                    Ver Perfil
                  </button>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '24px',
            }}
          >
            <button
              onClick={handlePrevious}
              disabled={!canGoPrevious}
              style={{
                padding: '8px 16px',
                backgroundColor: canGoPrevious ? '#6c757d' : '#ccc',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: canGoPrevious ? 'pointer' : 'not-allowed',
              }}
            >
              Anterior
            </button>

            <span style={{ color: '#666' }}>
              Página {cursorHistory.length + 1}
            </span>

            <button
              onClick={handleNext}
              disabled={!canGoNext}
              style={{
                padding: '8px 16px',
                backgroundColor: canGoNext ? '#007bff' : '#ccc',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: canGoNext ? 'pointer' : 'not-allowed',
              }}
            >
              Siguiente
            </button>
          </div>
        </>
      )}
    </div>
  );
}
