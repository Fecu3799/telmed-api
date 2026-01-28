import { useState, useEffect, useRef } from 'react';
import {
  createFormatJob,
  getFormatJob,
  putClinicalEpisodeFinalFormatted,
  type FormatJob,
  type FormatJobStatus,
  type CreateFormatJobPayload,
} from '../api/consultations';
import { consultationSocket } from '../api/socket';
import type { ProblemDetails } from '../api/http';

/**
 * Clinical Note Format Panel (AI Redaction).
 * What it does:
 * - Allows doctor to generate A/B/C proposals and select one to save as formattedBody.
 * How it works:
 * - Creates format job, polls status, shows proposals when completed, saves selected variant.
 * Gotchas:
 * - Only visible for doctor when final note exists.
 * - Uses Socket.IO for real-time updates, falls back to polling.
 * - Does not log PHI (only jobId, status, lengths).
 */
type ClinicalNoteFormatPanelProps = {
  consultationId: string;
  finalNoteId: string;
  originalBody: string; // Original note body to show in preview
  onFormattedSaved?: () => void;
};

export function ClinicalNoteFormatPanel({
  consultationId,
  finalNoteId,
  originalBody,
  onFormattedSaved,
}: ClinicalNoteFormatPanelProps) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<FormatJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<
    'A' | 'B' | 'C' | 'original' | null
  >(null);
  const pollingIntervalRef = useRef<number | null>(null);
  const socketConnectedRef = useRef(false);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, []);

  // Load jobId from sessionStorage on mount
  useEffect(() => {
    const stored = sessionStorage.getItem(
      `formatJob:${consultationId}:${finalNoteId}`,
    );
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as { jobId: string };
        setJobId(parsed.jobId);
      } catch {
        // Ignore invalid stored data
      }
    }
  }, [consultationId, finalNoteId]);

  // Save jobId to sessionStorage
  useEffect(() => {
    if (jobId) {
      sessionStorage.setItem(
        `formatJob:${consultationId}:${finalNoteId}`,
        JSON.stringify({ jobId }),
      );
    }
  }, [jobId, consultationId, finalNoteId]);

  // Socket.IO listeners for format.ready
  useEffect(() => {
    if (!jobId) {
      return;
    }

    const handleFormatReady = (payload: {
      consultationId: string;
      jobId: string;
      finalNoteId: string;
    }) => {
      if (
        payload.jobId === jobId &&
        payload.consultationId === consultationId
      ) {
        // Refetch job to get proposals
        void getFormatJob(jobId)
          .then((jobData) => {
            setJob(jobData);
          })
          .catch(() => {
            setError('Error al cargar propuestas');
          });
      }
    };

    const handleFormatFailed = (payload: {
      consultationId: string;
      jobId: string;
      errorCode: string;
    }) => {
      if (
        payload.jobId === jobId &&
        payload.consultationId === consultationId
      ) {
        setError(`Error al generar propuestas: ${payload.errorCode}`);
        // Refetch to get error details
        void getFormatJob(jobId)
          .then((jobData) => {
            setJob(jobData);
          })
          .catch(() => {
            // Ignore fetch errors, we already have errorCode
          });
      }
    };

    consultationSocket.onFormatJobReady(handleFormatReady);
    consultationSocket.onFormatJobFailed(handleFormatFailed);
    socketConnectedRef.current = consultationSocket.isConnected();

    return () => {
      consultationSocket.offFormatJobReady(handleFormatReady);
      consultationSocket.offFormatJobFailed(handleFormatFailed);
    };
  }, [jobId, consultationId]);

  // Start polling if job is queued/processing
  useEffect(() => {
    if (!jobId || !job) {
      return;
    }

    if (job.status === 'queued' || job.status === 'processing') {
      // Start polling every 1.5s, max 60s (40 attempts)
      let attempts = 0;
      const maxAttempts = 40;

      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }

      const intervalId = window.setInterval(() => {
        attempts++;
        if (attempts >= maxAttempts) {
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          setError('Timeout: el job está tardando más de lo esperado');
          return;
        }
        // Load job directly to avoid dependency issues
        void getFormatJob(jobId)
          .then((jobData) => {
            setJob(jobData);
            if (
              jobData.status === 'completed' ||
              jobData.status === 'failed' ||
              jobData.status === 'cancelled'
            ) {
              if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
                pollingIntervalRef.current = null;
              }
            }
          })
          .catch((err) => {
            const apiError = err as { problemDetails?: ProblemDetails };
            if (apiError.problemDetails?.status === 404) {
              setError('Job no encontrado');
              setJobId(null);
            }
          });
      }, 1500);

      pollingIntervalRef.current = intervalId;

      return () => {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      };
    }
  }, [jobId, job?.status]);

  // Load job on mount if jobId exists
  useEffect(() => {
    if (jobId && !job) {
      void getFormatJob(jobId)
        .then((jobData) => {
          setJob(jobData);
        })
        .catch((err) => {
          const apiError = err as { problemDetails?: ProblemDetails };
          if (apiError.problemDetails?.status === 404) {
            setError('Job no encontrado');
            setJobId(null);
          } else {
            setError('Error al cargar el estado del job');
          }
        });
    }
  }, [jobId, job]);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setJob(null);
    setSelectedVariant(null);

    try {
      const payload: CreateFormatJobPayload = {
        preset: 'standard',
        options: {
          length: 'medium',
          bullets: false,
          keywords: false,
          tone: 'clinical',
        },
      };

      const result = await createFormatJob(consultationId, payload);
      setJobId(result.jobId);
      setJob({
        id: result.jobId,
        status: result.status,
        preset: payload.preset ?? 'standard',
        options: payload.options ?? null,
        promptVersion: 1,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      const apiError = err as { problemDetails?: ProblemDetails };
      const status = apiError.problemDetails?.status;
      if (status === 409) {
        setError('Ya existe un job para esta nota. Recargando...');
        // Try to find existing job (would need backend support or retry)
      } else if (status === 403) {
        setError('No autorizado');
      } else if (status === 404) {
        setError('Nota final no encontrada');
      } else {
        setError('Error al crear el job de formateo');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSelectVariant = async (variant: 'A' | 'B' | 'C' | 'original') => {
    if (!job || job.status !== 'completed') {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (variant === 'original') {
        // Clear formattedBody (set to null)
        await putClinicalEpisodeFinalFormatted(consultationId, {
          formattedBody: '',
        });
      } else {
        const proposal = job.proposals?.[variant];
        if (!proposal?.body) {
          setError(`La propuesta ${variant} no está disponible`);
          return;
        }

        await putClinicalEpisodeFinalFormatted(consultationId, {
          formattedBody: proposal.body,
          formatVersion: job.promptVersion ?? 1,
          aiMeta: {
            provider: job.provider ?? undefined,
            model: job.model ?? undefined,
            variant,
            promptVersion: job.promptVersion ?? 1,
            formatProfile: 'clinical_default',
            jobId: job.id,
          },
        });
      }

      setSelectedVariant(variant);
      if (onFormattedSaved) {
        onFormattedSaved();
      }
    } catch (err) {
      const apiError = err as { problemDetails?: ProblemDetails };
      const status = apiError.problemDetails?.status;
      if (status === 422) {
        setError('El texto formateado es requerido');
      } else if (status === 403) {
        setError('No autorizado');
      } else if (status === 404) {
        setError('Consulta o nota final no encontrada');
      } else {
        setError('No se pudo guardar la versión seleccionada');
      }
    } finally {
      setSaving(false);
    }
  };

  const getStatusBadge = (status: FormatJobStatus) => {
    const badges: Record<FormatJobStatus, { text: string; color: string }> = {
      queued: { text: 'En cola', color: '#6b7280' },
      processing: { text: 'Procesando...', color: '#3b82f6' },
      completed: { text: 'Completado', color: '#16a34a' },
      failed: { text: 'Error', color: '#dc2626' },
      cancelled: { text: 'Cancelado', color: '#9ca3af' },
    };

    const badge = badges[status] ?? badges.queued;

    return (
      <span
        style={{
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '12px',
          fontWeight: '500',
          backgroundColor: `${badge.color}20`,
          color: badge.color,
        }}
      >
        {badge.text}
      </span>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ fontSize: '14px', fontWeight: 600 }}>
        Redacción asistida (opcional)
      </div>
      <div style={{ fontSize: '12px', color: '#737373' }}>
        Se generan 3 propuestas (A: breve, B: estándar, C: detallada). Elegí una
        para guardar como versión formateada.
      </div>

      {!jobId && (
        <button
          onClick={() => void handleGenerate()}
          disabled={loading}
          style={{
            alignSelf: 'flex-start',
            padding: '8px 14px',
            border: 'none',
            borderRadius: '6px',
            backgroundColor: loading ? '#9ca3af' : '#2563eb',
            color: 'white',
            fontSize: '13px',
            fontWeight: '500',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Creando job...' : 'Generar versiones A/B/C'}
        </button>
      )}

      {jobId && job && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13px',
            }}
          >
            <span>Estado:</span>
            {getStatusBadge(job.status)}
            {job.status === 'processing' && (
              <span style={{ fontSize: '12px', color: '#737373' }}>
                (puede tardar unos segundos)
              </span>
            )}
          </div>

          {job.status === 'completed' && job.proposals && (
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
            >
              <div style={{ fontSize: '13px', fontWeight: '500' }}>
                Propuestas generadas:
              </div>

              {/* Tabs for Original / A / B / C */}
              <div
                style={{
                  display: 'flex',
                  gap: '4px',
                  borderBottom: '1px solid #e5e5e5',
                }}
              >
                {(['original', 'A', 'B', 'C'] as const).map((variant) => (
                  <button
                    key={variant}
                    onClick={() => setSelectedVariant(variant)}
                    disabled={saving}
                    style={{
                      padding: '8px 12px',
                      border: 'none',
                      borderBottom:
                        selectedVariant === variant
                          ? '2px solid #2563eb'
                          : '2px solid transparent',
                      backgroundColor: 'transparent',
                      color:
                        selectedVariant === variant ? '#2563eb' : '#404040',
                      fontSize: '13px',
                      fontWeight: selectedVariant === variant ? '600' : '400',
                      cursor: saving ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {variant === 'original'
                      ? 'Original'
                      : `Variante ${variant} (${variant === 'A' ? 'breve' : variant === 'B' ? 'estándar' : 'detallada'})`}
                  </button>
                ))}
              </div>

              {/* Preview of selected variant */}
              {selectedVariant && (
                <div
                  style={{
                    border: '1px solid #e5e5e5',
                    borderRadius: '6px',
                    padding: '12px',
                    maxHeight: '300px',
                    overflowY: 'auto',
                    fontSize: '14px',
                    whiteSpace: 'pre-wrap',
                    backgroundColor: '#fafafa',
                  }}
                >
                  {selectedVariant === 'original'
                    ? originalBody
                    : (job.proposals[selectedVariant]?.body ?? 'No disponible')}
                </div>
              )}

              {/* Select button */}
              {selectedVariant && (
                <button
                  onClick={() => void handleSelectVariant(selectedVariant)}
                  disabled={saving}
                  style={{
                    alignSelf: 'flex-start',
                    padding: '8px 14px',
                    border: 'none',
                    borderRadius: '6px',
                    backgroundColor: saving ? '#9ca3af' : '#16a34a',
                    color: 'white',
                    fontSize: '13px',
                    fontWeight: '500',
                    cursor: saving ? 'not-allowed' : 'pointer',
                  }}
                >
                  {saving
                    ? 'Guardando...'
                    : selectedVariant === 'original'
                      ? 'Usar versión original'
                      : `Guardar como formateada (${selectedVariant})`}
                </button>
              )}
            </div>
          )}

          {job.status === 'failed' && job.error && (
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
              Error:{' '}
              {job.error.message ?? job.error.code ?? 'Error desconocido'}
            </div>
          )}
        </div>
      )}

      {error && (
        <div style={{ fontSize: '13px', color: '#b91c1c' }}>{error}</div>
      )}
    </div>
  );
}
