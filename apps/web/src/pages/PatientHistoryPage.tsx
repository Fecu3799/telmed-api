import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  getClinicalEpisode,
  listPatientConsultations,
  type ClinicalEpisodeResponse,
  type ConsultationHistoryItem,
} from '../api/consultations';
import type { ProblemDetails } from '../api/http';

export function PatientHistoryPage() {
  const navigate = useNavigate();
  const { activeRole } = useAuth();
  const [consultationId, setConsultationId] = useState('');
  const [episode, setEpisode] = useState<ClinicalEpisodeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ProblemDetails | null>(null);
  const [consultations, setConsultations] = useState<
    ConsultationHistoryItem[]
  >([]);
  const [consultationsLoading, setConsultationsLoading] = useState(false);
  const [consultationsError, setConsultationsError] =
    useState<ProblemDetails | null>(null);

  useEffect(() => {
    if (activeRole !== 'patient') {
      return;
    }
    let cancelled = false;
    setConsultationsLoading(true);
    setConsultationsError(null);
    listPatientConsultations({ page: 1, pageSize: 50 })
      .then((response) => {
        if (cancelled) return;
        setConsultations(response.items);
      })
      .catch((err) => {
        if (cancelled) return;
        const apiError = err as { problemDetails?: ProblemDetails };
        setConsultationsError(
          apiError.problemDetails || {
            status: 500,
            detail: 'Error al cargar consultas',
          },
        );
        setConsultations([]);
      })
      .finally(() => {
        if (!cancelled) {
          setConsultationsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeRole]);

  useEffect(() => {
    if (consultationId || consultations.length === 0) {
      return;
    }
    const first = consultations[0];
    if (first?.id) {
      setConsultationId(first.id);
      void handleLoadEpisode(first.id);
    }
  }, [consultations, consultationId]);

  useEffect(() => {
    if (activeRole && activeRole !== 'patient') {
      navigate('/lobby');
    }
  }, [activeRole, navigate]);

  if (activeRole !== 'patient') {
    return null;
  }

  const handleLoadEpisode = async (id: string) => {
    if (!id) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await getClinicalEpisode(id);
      setEpisode(result);
    } catch (err) {
      const apiError = err as { problemDetails?: ProblemDetails };
      setEpisode(null);
      setError(
        apiError.problemDetails ?? {
          status: 500,
          detail: 'No se pudieron cargar las notas.',
        },
      );
    } finally {
      setLoading(false);
    }
  };

  const renderEpisode = () => {
    if (loading) {
      return <div style={{ fontSize: '14px' }}>Cargando notas...</div>;
    }
    if (error) {
      if (error.status === 404) {
        return (
          <div style={{ fontSize: '14px', color: '#737373' }}>
            Notas no disponibles todavía.
          </div>
        );
      }
      if (error.status === 403) {
        return (
          <div style={{ fontSize: '14px', color: '#737373' }}>
            No disponible.
          </div>
        );
      }
      return (
        <div
          style={{
            padding: '8px 12px',
            backgroundColor: '#fee',
            border: '1px solid #fcc',
            borderRadius: '4px',
            color: '#c33',
            fontSize: '13px',
          }}
        >
          {error.detail}
        </div>
      );
    }
    if (!episode || !episode.final) {
      return (
        <div style={{ fontSize: '14px', color: '#737373' }}>
          Notas no disponibles todavía.
        </div>
      );
    }

    const finalNote = episode.final;
    const addendums = episode.addendums ?? [];
    const sortedAddendums = [...addendums].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    const displayBody =
      finalNote.displayBody ?? finalNote.formattedBody ?? finalNote.body ?? '';

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600 }}>Final</div>
          <div style={{ fontSize: '13px', color: '#737373' }}>
            {finalNote.title}
          </div>
          <div style={{ fontSize: '14px', whiteSpace: 'pre-wrap' }}>
            {displayBody}
          </div>
        </div>
        {sortedAddendums.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontSize: '14px', fontWeight: 600 }}>Addendums</div>
            {sortedAddendums.map((note) => (
              <div key={note.id} style={{ fontSize: '14px' }}>
                <div style={{ fontSize: '13px', color: '#737373' }}>
                  {note.title} · {new Date(note.createdAt).toLocaleString()}
                </div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{note.body}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

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
        <h1 style={{ margin: 0 }}>Historia Clínica</h1>
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

      <div
        style={{
          border: '1px solid #ddd',
          borderRadius: '8px',
          padding: '16px',
          backgroundColor: 'white',
          marginBottom: '16px',
        }}
      >
        <h2 style={{ marginTop: 0 }}>Mis consultas</h2>
        {consultationsLoading ? (
          <div style={{ fontSize: '14px' }}>Cargando consultas...</div>
        ) : consultationsError ? (
          <div style={{ fontSize: '14px', color: '#c33' }}>
            {consultationsError.detail}
          </div>
        ) : consultations.length === 0 ? (
          <div style={{ fontSize: '14px', color: '#737373' }}>
            No hay consultas registradas.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {consultations.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  border: '1px solid #e5e5e5',
                  borderRadius: '6px',
                }}
              >
                <div style={{ fontSize: '14px', color: '#404040' }}>
                  <div>
                    <strong>Fecha:</strong>{' '}
                    {new Date(item.createdAt).toLocaleString()}
                  </div>
                  <div>
                    <strong>Estado:</strong> {item.status}
                  </div>
                  <div>
                    <strong>Doctor:</strong> {item.doctor.displayName}
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (!item.id) {
                      return;
                    }
                    setConsultationId(item.id);
                    void handleLoadEpisode(item.id);
                  }}
                  disabled={!item.id}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: item.id ? '#007bff' : '#ccc',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: item.id ? 'pointer' : 'not-allowed',
                  }}
                >
                  Ver episodio
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
          <input
            value={consultationId}
            onChange={(event) => setConsultationId(event.target.value)}
            placeholder="Ingresá el ID de consulta (opcional)"
            style={{
              flex: 1,
              padding: '8px 12px',
              border: '1px solid #d4d4d4',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          />
          <button
            onClick={() => void handleLoadEpisode(consultationId)}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: '#6c757d',
              color: 'white',
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            Buscar por ID
          </button>
        </div>
      </div>

      <div
        style={{
          border: '1px solid #ddd',
          borderRadius: '8px',
          padding: '16px',
          backgroundColor: 'white',
          marginBottom: '16px',
        }}
      >
        <h2 style={{ marginTop: 0 }}>Notas del episodio</h2>
        {renderEpisode()}
      </div>

      <div
        style={{
          border: '1px solid #ddd',
          borderRadius: '8px',
          padding: '16px',
          backgroundColor: 'white',
        }}
      >
        <h2 style={{ marginTop: 0 }}>Perfil clínico</h2>
        <div style={{ fontSize: '14px', color: '#737373' }}>
          Próximamente: alergias, medicación habitual, condiciones y
          procedimientos.
        </div>
      </div>
    </div>
  );
}
