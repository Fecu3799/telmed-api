import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  listDoctorPatients,
  type PatientSummary,
  type DoctorPatientsResponse,
} from '../api/doctor-patients';
import { type ProblemDetails } from '../api/http';

/**
 * Format ISO UTC datetime to local string
 */
function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString('es-AR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function DoctorPatientsPage() {
  const navigate = useNavigate();
  const { getActiveToken, activeRole } = useAuth();

  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ProblemDetails | null>(null);
  const [page, setPage] = useState(1);
  const [pageInfo, setPageInfo] = useState<{
    page: number;
    limit: number;
    total: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  } | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // Redirect if not doctor
  useEffect(() => {
    if (activeRole && activeRole !== 'doctor') {
      navigate('/lobby');
    }
  }, [activeRole, navigate]);

  // Load patients
  useEffect(() => {
    const loadPatients = async () => {
      if (!getActiveToken() || activeRole !== 'doctor') {
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response: DoctorPatientsResponse = await listDoctorPatients({
          page,
          limit: 10, // Default page size (within max 50)
          q: searchQuery || undefined,
        });

        setPatients(response.items);
        setPageInfo(response.pageInfo);
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
            detail: 'Error al cargar pacientes',
          });
        }
        setPatients([]);
        setPageInfo(null);
      } finally {
        setLoading(false);
      }
    };

    void loadPatients();
  }, [page, searchQuery, getActiveToken, activeRole]);

  // Handle search
  const handleSearch = () => {
    setSearchQuery(searchInput);
    setPage(1);
  };

  // Handle 401/403 -> redirect to login
  useEffect(() => {
    if (error && (error.status === 401 || error.status === 403)) {
      navigate('/login');
    }
  }, [error, navigate]);

  if (activeRole !== 'doctor') {
    return null;
  }

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
        <h1 style={{ margin: 0 }}>Mis Pacientes</h1>
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

      {/* Search */}
      <div
        style={{
          marginBottom: '24px',
          padding: '16px',
          backgroundColor: '#f5f5f5',
          borderRadius: '4px',
        }}
      >
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSearch();
              }
            }}
            placeholder="Buscar por nombre o email..."
            style={{
              flex: 1,
              padding: '8px',
              border: '1px solid #ccc',
              borderRadius: '4px',
            }}
          />
          <button
            onClick={handleSearch}
            style={{
              padding: '8px 16px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Buscar
          </button>
          {searchQuery && (
            <button
              onClick={() => {
                setSearchInput('');
                setSearchQuery('');
                setPage(1);
              }}
              style={{
                padding: '8px 16px',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Limpiar
            </button>
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
      {!loading && patients.length === 0 && !error && (
        <div
          style={{
            textAlign: 'center',
            padding: '48px',
            color: '#666',
          }}
        >
          {searchQuery
            ? 'No se encontraron pacientes con ese criterio de búsqueda.'
            : 'No tenés pacientes con contacto clínico registrado.'}
        </div>
      )}

      {/* Patients List */}
      {!loading && patients.length > 0 && (
        <>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              marginBottom: '24px',
            }}
          >
            {patients.map((patient) => (
              <div
                key={patient.id}
                style={{
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  padding: '16px',
                  backgroundColor: 'white',
                }}
              >
                <div style={{ marginBottom: '8px' }}>
                  <strong>{patient.fullName}</strong>
                </div>
                {patient.email && (
                  <div style={{ marginBottom: '8px', color: '#666' }}>
                    <strong>Email:</strong> {patient.email}
                  </div>
                )}
                <div style={{ marginBottom: '8px', color: '#666' }}>
                  <strong>Última interacción:</strong>{' '}
                  {formatDateTime(patient.lastInteractionAt)}
                </div>
                {patient.lastAppointmentAt && (
                  <div
                    style={{
                      marginBottom: '8px',
                      color: '#666',
                      fontSize: '14px',
                    }}
                  >
                    Último turno: {formatDateTime(patient.lastAppointmentAt)}
                  </div>
                )}
                {patient.lastConsultationAt && (
                  <div
                    style={{
                      marginBottom: '8px',
                      color: '#666',
                      fontSize: '14px',
                    }}
                  >
                    Última consulta:{' '}
                    {formatDateTime(patient.lastConsultationAt)}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <button
                    onClick={() =>
                      navigate(`/doctor-patients/${patient.id}`, {
                        state: { patient },
                      })
                    }
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#007bff',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    Ver Datos
                  </button>
                  <button
                    onClick={() =>
                      navigate(`/doctor-patients/${patient.id}/files`)
                    }
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    Archivos
                  </button>
                  <button
                    onClick={() =>
                      navigate(`/doctor-patients/${patient.id}/history`)
                    }
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#6c757d',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    Historia Clínica
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {pageInfo && (pageInfo.hasNextPage || pageInfo.hasPrevPage) && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '24px',
              }}
            >
              <button
                onClick={() => setPage(page - 1)}
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

              <span style={{ color: '#666' }}>
                Página {pageInfo.page} de{' '}
                {Math.ceil(pageInfo.total / pageInfo.limit)}
              </span>

              <button
                onClick={() => setPage(page + 1)}
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
          )}
        </>
      )}
    </div>
  );
}
