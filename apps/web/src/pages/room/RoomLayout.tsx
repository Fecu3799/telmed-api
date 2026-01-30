import {
  RoomAudioRenderer,
  ControlBar,
  VideoTrack,
  useTracks,
  type TrackReference,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import { useEffect, useRef, useState } from 'react';
import {
  getClinicalEpisode,
  postClinicalEpisodeFinalize,
  postClinicalEpisodeAddendum,
  putClinicalEpisodeDraft,
  putClinicalEpisodeFinalFormatted,
  type ClinicalEpisodeResponse,
  type ConsultationStatus,
} from '../../api/consultations';
import { ClinicalNoteFormatPanel } from '../../components/ClinicalNoteFormatPanel';
import type { ProblemDetails } from '../../api/http';
import { consultationSocket } from '../../api/socket';
import { type ActiveRole, useAuth } from '../../auth/AuthContext';

/**
 * RoomLayout: All components that require LiveKit room context.
 * This component MUST be rendered inside <LiveKitRoom>.
 */
type RoomLayoutProps = {
  activeRole: ActiveRole | null;
  consultationId: string;
  consultationStatus?: ConsultationStatus | null;
  onCloseConsultation?: () => void;
  closing?: boolean;
};

export function RoomLayout({
  activeRole,
  consultationId,
  consultationStatus,
  onCloseConsultation,
  closing = false,
}: RoomLayoutProps) {
  const { getActiveToken } = useAuth();

  // Connect socket for format job events
  useEffect(() => {
    if (!activeRole || activeRole === 'admin' || !consultationId) {
      return;
    }

    const token = getActiveToken();
    if (token) {
      consultationSocket.connect(token);
      // Join consultation room for socket events
      consultationSocket.joinConsultation(consultationId);
    }

    return () => {
      // Don't disconnect socket here - it may be used by other components
      // Just unsubscribe from consultation room if needed
    };
  }, [activeRole, consultationId, getActiveToken]);

  // Get all camera tracks (remote and local)
  const tracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false },
  );

  // Filter out placeholders (only tracks with valid publication)
  // and separate local and remote tracks
  const validTracks = tracks.filter(
    (trackRef) =>
      'publication' in trackRef &&
      trackRef.publication !== undefined &&
      trackRef.publication.track !== undefined,
  ) as TrackReference[];

  const localTrack = validTracks.find(
    (trackRef) => trackRef.participant?.isLocal === true,
  );
  const remoteTrack = validTracks.find(
    (trackRef) => trackRef.participant?.isLocal !== true,
  );

  const hceSectionRef = useRef<HTMLDivElement | null>(null);
  const [episodeLoading, setEpisodeLoading] = useState(false);
  const [episodeError, setEpisodeError] = useState<ProblemDetails | null>(null);
  const [episodeData, setEpisodeData] =
    useState<ClinicalEpisodeResponse | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [draftDirty, setDraftDirty] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [formattedBody, setFormattedBody] = useState('');
  const [formattedDirty, setFormattedDirty] = useState(false);
  const [savingFormatted, setSavingFormatted] = useState(false);
  const [formattedError, setFormattedError] = useState<string | null>(null);
  const [addendumTitle, setAddendumTitle] = useState('');
  const [addendumBody, setAddendumBody] = useState('');
  const [addingAddendum, setAddingAddendum] = useState(false);
  const [addendumError, setAddendumError] = useState<string | null>(null);
  const lastFinalIdRef = useRef<string>('none');
  const lastDraftKeyRef = useRef<string>('none');

  useEffect(() => {
    setEpisodeData(null);
    setEpisodeError(null);
    setDraftTitle('');
    setDraftBody('');
    setDraftDirty(false);
    setDraftError(null);
    setFinalizeError(null);
    setFormattedBody('');
    setFormattedDirty(false);
    setFormattedError(null);
    setAddendumTitle('');
    setAddendumBody('');
    setAddendumError(null);
    lastFinalIdRef.current = 'none';
    lastDraftKeyRef.current = 'none';
  }, [consultationId]);

  const loadEpisode = (role: 'doctor' | 'patient') => {
    let cancelled = false;
    setEpisodeLoading(true);
    setEpisodeError(null);

    getClinicalEpisode(consultationId)
      .then((data) => {
        if (!cancelled) {
          setEpisodeData(data);
          if (role === 'doctor') {
            setDraftError(null);
            setFinalizeError(null);
          }
        }
      })
      .catch((err: unknown) => {
        const apiError = err as { problemDetails?: ProblemDetails };
        if (!cancelled) {
          setEpisodeData(null);
          setEpisodeError(
            apiError.problemDetails ?? {
              status: 500,
              detail: 'No se pudieron cargar las notas.',
            },
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setEpisodeLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  };

  useEffect(() => {
    if (!activeRole || !consultationId) {
      return;
    }

    return loadEpisode(activeRole);
  }, [activeRole, consultationId]);

  useEffect(() => {
    if (activeRole !== 'doctor') {
      return;
    }

    const draft = episodeData?.draft ?? null;
    const draftKey = draft?.id ?? 'none';

    if (!draft && episodeData?.final) {
      return;
    }

    if (!draftDirty || draftKey !== lastDraftKeyRef.current) {
      setDraftTitle(draft?.title ?? '');
      setDraftBody(draft?.body ?? '');
      setDraftDirty(false);
      lastDraftKeyRef.current = draftKey;
    }
  }, [activeRole, episodeData?.draft, draftDirty]);

  useEffect(() => {
    if (activeRole !== 'doctor') {
      return;
    }

    const finalNote = episodeData?.final ?? null;
    const finalKey = finalNote?.id ?? 'none';

    if (!formattedDirty || finalKey !== lastFinalIdRef.current) {
      setFormattedBody(finalNote?.formattedBody ?? '');
      setFormattedDirty(false);
      lastFinalIdRef.current = finalKey;
    }
  }, [activeRole, episodeData?.final, formattedDirty]);

  const isClosed = consultationStatus === 'closed';
  const hasStatus =
    consultationStatus !== null && consultationStatus !== undefined;
  const hasFinal = Boolean(episodeData?.final);
  const canShowAddendumForm =
    activeRole === 'doctor' && hasFinal && (!hasStatus || isClosed);

  const handleSaveDraft = async () => {
    setDraftError(null);
    setFinalizeError(null);
    setSavingDraft(true);
    try {
      const result = await putClinicalEpisodeDraft(consultationId, {
        title: draftTitle,
        body: draftBody,
      });
      setEpisodeData(result);
      setEpisodeError(null);
      setDraftDirty(false);
      lastDraftKeyRef.current = result.draft?.id ?? lastDraftKeyRef.current;
      setDraftTitle(result.draft?.title ?? draftTitle);
      setDraftBody(result.draft?.body ?? draftBody);
    } catch (err) {
      const apiError = err as { problemDetails?: ProblemDetails };
      const status = apiError.problemDetails?.status;
      if (status === 409) {
        setDraftError(
          'La consulta está cerrada. No se puede editar. (usar addendum luego)',
        );
      } else if (status === 422) {
        setDraftError('Completar título y texto');
      } else {
        setDraftError('No se pudo guardar el borrador.');
      }
    } finally {
      setSavingDraft(false);
    }
  };

  const handleFinalize = async () => {
    setFinalizeError(null);
    setDraftError(null);
    setFinalizing(true);
    try {
      const result = await postClinicalEpisodeFinalize(consultationId);
      setEpisodeData(result);
      setEpisodeError(null);
      if (activeRole === 'doctor') {
        loadEpisode('doctor');
      }
    } catch (err) {
      const apiError = err as { problemDetails?: ProblemDetails };
      const status = apiError.problemDetails?.status;
      if (status === 422) {
        setFinalizeError('Primero guardá un borrador.');
      } else if (status === 409) {
        setFinalizeError('Ya existe una nota final.');
      } else {
        setFinalizeError('No se pudo finalizar la nota.');
      }
    } finally {
      setFinalizing(false);
    }
  };

  const handleSaveFormatted = async () => {
    setFormattedError(null);
    setSavingFormatted(true);
    try {
      const result = await putClinicalEpisodeFinalFormatted(consultationId, {
        formattedBody,
      });
      setEpisodeData(result);
      setEpisodeError(null);
      setFormattedDirty(false);
      lastFinalIdRef.current = result.final?.id ?? lastFinalIdRef.current;
      setFormattedBody(result.final?.formattedBody ?? formattedBody);
    } catch (err) {
      const apiError = err as { problemDetails?: ProblemDetails };
      const status = apiError.problemDetails?.status;
      if (status === 422) {
        setFormattedError('El texto formateado es requerido.');
      } else if (status === 403) {
        setFormattedError('No autorizado.');
      } else if (status === 404) {
        setFormattedError('Consulta o nota final no encontrada.');
      } else if (status === 409) {
        setFormattedError('No se pudo guardar la versión formateada.');
      } else {
        setFormattedError('No se pudo guardar la versión formateada.');
      }
    } finally {
      setSavingFormatted(false);
    }
  };

  const handleAddendum = async () => {
    setAddendumError(null);
    setAddingAddendum(true);
    try {
      await postClinicalEpisodeAddendum(consultationId, {
        title: addendumTitle,
        body: addendumBody,
      });
      setAddendumTitle('');
      setAddendumBody('');
      loadEpisode('doctor');
    } catch (err) {
      const apiError = err as { problemDetails?: ProblemDetails };
      const status = apiError.problemDetails?.status;
      if (status === 422) {
        setAddendumError('Título y texto requeridos.');
      } else if (status === 403) {
        setAddendumError('No autorizado.');
      } else if (status === 409) {
        setAddendumError(
          'Solo se puede agregar un addendum cuando la consulta está cerrada y existe una nota final.',
        );
      } else {
        setAddendumError('No se pudo agregar el addendum.');
      }
    } finally {
      setAddingAddendum(false);
    }
  };

  const formatDate = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }
    return parsed.toLocaleString();
  };

  const renderDoctorDraftEditor = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ fontSize: '14px', fontWeight: 600 }}>
        Borrador {hasFinal ? '(solo lectura)' : ''}
      </div>
      <input
        value={draftTitle}
        onChange={(event) => {
          setDraftTitle(event.target.value);
          setDraftDirty(true);
        }}
        placeholder="Título del borrador"
        disabled={savingDraft || isClosed || hasFinal}
        style={{
          width: '100%',
          padding: '8px 12px',
          border: '1px solid #d4d4d4',
          borderRadius: '6px',
          fontSize: '14px',
        }}
      />
      <textarea
        value={draftBody}
        onChange={(event) => {
          setDraftBody(event.target.value);
          setDraftDirty(true);
        }}
        placeholder="Texto del borrador"
        disabled={savingDraft || isClosed || hasFinal}
        style={{
          width: '100%',
          minHeight: '160px',
          padding: '12px',
          border: '1px solid #d4d4d4',
          borderRadius: '6px',
          fontSize: '14px',
          fontFamily: 'inherit',
          resize: 'vertical',
        }}
      />
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          onClick={() => void handleSaveDraft()}
          disabled={savingDraft || isClosed || hasFinal}
          style={{
            padding: '8px 14px',
            border: 'none',
            borderRadius: '6px',
            backgroundColor:
              savingDraft || isClosed || hasFinal ? '#9ca3af' : '#2563eb',
            color: 'white',
            fontSize: '13px',
            fontWeight: '500',
            cursor:
              savingDraft || isClosed || hasFinal ? 'not-allowed' : 'pointer',
          }}
        >
          {savingDraft ? 'Guardando...' : 'Guardar borrador'}
        </button>
        {!hasFinal && (
          <button
            onClick={() => void handleFinalize()}
            disabled={finalizing}
            style={{
              padding: '8px 14px',
              border: '1px solid #d4d4d4',
              borderRadius: '6px',
              backgroundColor: finalizing ? '#e5e7eb' : '#fff',
              color: '#404040',
              fontSize: '13px',
              fontWeight: '500',
              cursor: finalizing ? 'not-allowed' : 'pointer',
            }}
          >
            {finalizing ? 'Finalizando...' : 'Finalizar notas'}
          </button>
        )}
      </div>
      {draftError && (
        <div style={{ fontSize: '13px', color: '#b91c1c' }}>{draftError}</div>
      )}
      {finalizeError && (
        <div style={{ fontSize: '13px', color: '#b91c1c' }}>
          {finalizeError}
        </div>
      )}
      {isClosed && !hasFinal && (
        <div style={{ fontSize: '12px', color: '#737373' }}>
          La consulta está cerrada. Solo podés finalizar si hay un borrador
          existente.
        </div>
      )}
    </div>
  );

  const renderEpisodeContent = () => {
    if (!activeRole) {
      return null;
    }

    if (episodeLoading) {
      return <div style={{ fontSize: '14px' }}>Cargando notas...</div>;
    }

    if (episodeError) {
      if (episodeError.status === 404 && activeRole === 'doctor') {
        return (
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
          >
            <div style={{ fontSize: '14px', color: '#737373' }}>
              Aún no hay notas cargadas.
            </div>
            {renderDoctorDraftEditor()}
          </div>
        );
      }
      if (episodeError.status === 404) {
        return (
          <div style={{ fontSize: '14px', color: '#737373' }}>
            {activeRole === 'patient'
              ? 'Notas no disponibles todavía.'
              : 'Aún no hay notas cargadas.'}
          </div>
        );
      }
      if (episodeError.status === 403) {
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
          {episodeError.detail}
        </div>
      );
    }

    if (!episodeData) {
      return (
        <div style={{ fontSize: '14px', color: '#737373' }}>
          {activeRole === 'patient'
            ? 'Notas no disponibles todavía.'
            : 'Aún no hay notas cargadas.'}
        </div>
      );
    }

    const draft = episodeData.draft;
    const finalNote = episodeData.final;
    const addendums = episodeData.addendums ?? [];
    const sortedAddendums = [...addendums].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    if (
      !draft &&
      !finalNote &&
      addendums.length === 0 &&
      activeRole === 'doctor'
    ) {
      return (
        <div style={{ fontSize: '14px', color: '#737373' }}>
          Aún no hay notas cargadas.
        </div>
      );
    }

    const finalDisplay =
      finalNote?.displayBody ??
      finalNote?.formattedBody ??
      finalNote?.body ??
      '';

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {activeRole === 'doctor' && renderDoctorDraftEditor()}
        {finalNote && (
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600 }}>Final</div>
            <div style={{ fontSize: '13px', color: '#737373' }}>
              {finalNote.title}
            </div>
            <div style={{ fontSize: '14px', whiteSpace: 'pre-wrap' }}>
              {finalDisplay}
            </div>
          </div>
        )}
        {activeRole === 'doctor' && finalNote && (
          <ClinicalNoteFormatPanel
            consultationId={consultationId}
            finalNoteId={finalNote.id}
            originalBody={finalNote.body ?? ''}
            onFormattedSaved={() => {
              // Reload episode to get updated formattedBody
              if (activeRole === 'doctor') {
                loadEpisode('doctor');
              }
            }}
          />
        )}
        {canShowAddendumForm && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '14px', fontWeight: 600 }}>
              Agregar addendum
            </div>
            <input
              value={addendumTitle}
              onChange={(event) => setAddendumTitle(event.target.value)}
              placeholder="Título del addendum"
              disabled={addingAddendum}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d4d4d4',
                borderRadius: '6px',
                fontSize: '14px',
              }}
            />
            <textarea
              value={addendumBody}
              onChange={(event) => setAddendumBody(event.target.value)}
              placeholder="Texto del addendum"
              disabled={addingAddendum}
              style={{
                width: '100%',
                minHeight: '120px',
                padding: '12px',
                border: '1px solid #d4d4d4',
                borderRadius: '6px',
                fontSize: '14px',
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
            <button
              onClick={() => void handleAddendum()}
              disabled={
                addingAddendum ||
                addendumTitle.trim() === '' ||
                addendumBody.trim() === ''
              }
              style={{
                alignSelf: 'flex-start',
                padding: '8px 14px',
                border: 'none',
                borderRadius: '6px',
                backgroundColor:
                  addingAddendum ||
                  addendumTitle.trim() === '' ||
                  addendumBody.trim() === ''
                    ? '#9ca3af'
                    : '#0ea5e9',
                color: 'white',
                fontSize: '13px',
                fontWeight: '500',
                cursor:
                  !finalNote ||
                  !isClosed ||
                  addingAddendum ||
                  addendumTitle.trim() === '' ||
                  addendumBody.trim() === ''
                    ? 'not-allowed'
                    : 'pointer',
              }}
            >
              {addingAddendum ? 'Agregando...' : 'Agregar addendum'}
            </button>
            {addendumError && (
              <div style={{ fontSize: '13px', color: '#b91c1c' }}>
                {addendumError}
              </div>
            )}
          </div>
        )}
        {sortedAddendums.length > 0 && (
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
          >
            <div style={{ fontSize: '14px', fontWeight: 600 }}>Addendums</div>
            {sortedAddendums.map((note) => (
              <div key={note.id} style={{ fontSize: '14px' }}>
                <div style={{ fontSize: '13px', color: '#737373' }}>
                  {note.title} · {formatDate(note.createdAt)}
                </div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{note.body}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Debug logs (only in dev)
  if (import.meta.env.DEV) {
    console.log('[RoomLayout] Tracks status', {
      totalTracks: tracks.length,
      validTracks: validTracks.length,
      hasLocalTrack: !!localTrack,
      hasRemoteTrack: !!remoteTrack,
      localTrackParticipant: localTrack?.participant?.identity,
      remoteTrackParticipant: remoteTrack?.participant?.identity,
    });
  }

  return (
    <div
      className="room-layout-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(520px, 1fr) 380px',
        gridTemplateRows: '1fr 96px',
        gridTemplateAreas: `
          "video side"
          "bottom bottom"
        `,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Video area: main stage with remote video + local PiP */}
      <div
        className="room-video-area"
        style={{
          gridArea: 'video',
          position: 'relative',
          backgroundColor: '#171717',
          overflow: 'hidden',
          display: 'flex',
          justifyContent: 'flex-start',
          alignItems: 'flex-start',
        }}
      >
        {/* Main stage: Remote video (fills container, aligned top-left) */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            justifyContent: 'flex-start',
            alignItems: 'flex-start',
          }}
        >
          {remoteTrack ? (
            <VideoTrack
              trackRef={remoteTrack}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                borderRadius: '0',
              }}
            />
          ) : (
            <div
              style={{
                color: '#fff',
                fontSize: '18px',
                textAlign: 'center',
                width: '100%',
                paddingTop: '40px',
              }}
            >
              Waiting for remote participant...
            </div>
          )}
        </div>

        {/* Picture-in-Picture: Local video overlay (small, top-right within video area) */}
        {localTrack && (
          <div
            className="local-video-pip"
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              width: '224px',
              height: '160px',
              borderRadius: '8px',
              overflow: 'hidden',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
              border: '2px solid rgba(255, 255, 255, 0.3)',
              zIndex: 10,
            }}
          >
            <VideoTrack
              trackRef={localTrack}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
          </div>
        )}
      </div>

      {/* Side panel: Clinical data (placeholder) */}
      <div
        className="room-side-panel"
        style={{
          gridArea: 'side',
          backgroundColor: '#ffffff',
          borderLeft: '1px solid #e5e5e5',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Patient Summary Section */}
        <div
          style={{
            padding: '20px',
            borderBottom: '1px solid #e5e5e5',
          }}
        >
          <h3
            style={{
              margin: '0 0 12px 0',
              fontSize: '18px',
              fontWeight: '600',
              color: '#171717',
            }}
          >
            Patient Summary
          </h3>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ fontSize: '16px', color: '#404040' }}>
              <strong>Name:</strong> [Patient Name Placeholder]
            </div>
            <div style={{ fontSize: '14px', color: '#737373' }}>
              <strong>Age:</strong> [Age Placeholder]
            </div>
            <div
              style={{
                display: 'flex',
                gap: '8px',
                flexWrap: 'wrap',
                marginTop: '8px',
              }}
            >
              <span
                style={{
                  padding: '4px 12px',
                  backgroundColor: '#f5f5f5',
                  borderRadius: '4px',
                  fontSize: '12px',
                  color: '#404040',
                }}
              >
                Tag 1
              </span>
              <span
                style={{
                  padding: '4px 12px',
                  backgroundColor: '#f5f5f5',
                  borderRadius: '4px',
                  fontSize: '12px',
                  color: '#404040',
                }}
              >
                Tag 2
              </span>
            </div>
          </div>
        </div>

        {/* HCE Section */}
        {activeRole && (
          <div
            ref={hceSectionRef}
            style={{
              padding: '20px',
              borderBottom: '1px solid #e5e5e5',
              flex: 1,
            }}
          >
            <h3
              style={{
                margin: '0 0 12px 0',
                fontSize: '18px',
                fontWeight: '600',
                color: '#171717',
              }}
            >
              Historia Clínica
            </h3>
            {renderEpisodeContent()}
          </div>
        )}

        {/* Actions Section */}
        <div
          style={{
            padding: '20px',
            borderBottom: '1px solid #e5e5e5',
          }}
        >
          <h3
            style={{
              margin: '0 0 12px 0',
              fontSize: '18px',
              fontWeight: '600',
              color: '#171717',
            }}
          >
            Actions
          </h3>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            {activeRole === 'doctor' && onCloseConsultation && (
              <button
                onClick={onCloseConsultation}
                disabled={closing}
                style={{
                  padding: '10px 16px',
                  border: 'none',
                  borderRadius: '6px',
                  backgroundColor: closing ? '#888' : '#dc2626',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: closing ? 'not-allowed' : 'pointer',
                }}
              >
                {closing ? 'Finalizando...' : 'Terminar consulta'}
              </button>
            )}
            {activeRole === 'patient' && (
              <button
                onClick={() =>
                  hceSectionRef.current?.scrollIntoView({ behavior: 'smooth' })
                }
                style={{
                  padding: '10px 16px',
                  border: '1px solid #d4d4d4',
                  borderRadius: '6px',
                  backgroundColor: 'white',
                  color: '#404040',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                }}
              >
                Historia Clínica
              </button>
            )}
            <button
              style={{
                padding: '10px 16px',
                border: '1px solid #d4d4d4',
                borderRadius: '6px',
                backgroundColor: 'white',
                color: '#404040',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
              }}
            >
              Extend Time
            </button>
            <button
              style={{
                padding: '10px 16px',
                border: '1px solid #d4d4d4',
                borderRadius: '6px',
                backgroundColor: 'white',
                color: '#404040',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
              }}
            >
              Flag Issue
            </button>
          </div>
        </div>
      </div>

      {/* Bottom bar: Status + ControlBar + Consultation info */}
      <div
        className="room-bottom-bar"
        style={{
          gridArea: 'bottom',
          borderTop: '1px solid #404040',
          backgroundColor: '#0a0a0a',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: '16px',
        }}
      >
        {/* Left: Connection status + IDs */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            minWidth: '200px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '14px',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#22c55e',
              }}
            />
            <span>Connected</span>
          </div>
          <div style={{ fontSize: '12px', color: '#a3a3a3' }}>
            Room: [Room Name]
          </div>
        </div>

        {/* Center: ControlBar */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <div style={{ maxWidth: '600px', width: '100%' }}>
            <ControlBar />
          </div>
        </div>

        {/* Right: Consultation status / timers placeholder */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            minWidth: '150px',
            alignItems: 'flex-end',
          }}
        >
          <div style={{ fontSize: '14px', fontWeight: '500' }}>
            Status: in_progress
          </div>
          <div style={{ fontSize: '12px', color: '#a3a3a3' }}>
            Duration: [Timer placeholder]
          </div>
        </div>
      </div>

      {/* Audio renderer (hidden, but required for audio) */}
      <RoomAudioRenderer />
    </div>
  );
}
