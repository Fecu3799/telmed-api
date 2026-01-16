import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LiveKitRoom } from '@livekit/components-react';
import { getLivekitToken, type LiveKitTokenResponse } from '../api/livekit';
import { type ProblemDetails } from '../api/http';
import { useAuth } from '../auth/AuthContext';
import { RoomLayout } from './room/RoomLayout';
import { RoomErrorBoundary } from './room/RoomErrorBoundary';
import {
  closeConsultation,
  getConsultation,
  type Consultation,
} from '../api/consultations';
import { getOrCreateThread, type ChatThread } from '../api/chats';
import { ChatDrawer } from '../components/ChatDrawer';
import { PatientFilesDrawer } from '../components/PatientFilesDrawer';

type ConnectionState = 'idle' | 'loading' | 'connected' | 'error';

export function RoomPage() {
  const { consultationId } = useParams<{ consultationId: string }>();
  const navigate = useNavigate();
  const { activeRole, doctorToken, patientToken } = useAuth();

  const [connectionState, setConnectionState] =
    useState<ConnectionState>('idle');
  const [error, setError] = useState<ProblemDetails | null>(null);
  const [tokenData, setTokenData] = useState<LiveKitTokenResponse | null>(null);
  const [selectedRole, setSelectedRole] = useState<'doctor' | 'patient' | null>(
    null,
  );
  const hasAutoJoinedRef = useRef(false);

  // Chat state
  const [consultation, setConsultation] = useState<Consultation | null>(null);
  const [chatThread, setChatThread] = useState<ChatThread | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  const handleJoin = async (role: 'doctor' | 'patient') => {
    if (!consultationId) {
      setError({ status: 400, detail: 'Consultation ID is required' });
      return;
    }

    // Join gating: only allow joining with activeRole
    if (activeRole !== role) {
      setError({
        status: 403,
        detail: `You can only join as ${activeRole}. Please switch roles first.`,
      });
      return;
    }

    // Check if token exists for the role
    if (role === 'doctor' && !doctorToken) {
      setError({
        status: 401,
        detail: 'Doctor token not found. Please login as doctor first.',
      });
      return;
    }

    if (role === 'patient' && !patientToken) {
      setError({
        status: 401,
        detail: 'Patient token not found. Please login as patient first.',
      });
      return;
    }

    setConnectionState('loading');
    setError(null);
    setSelectedRole(role);

    try {
      const tokenResponse = await getLivekitToken(consultationId, role);
      setTokenData(tokenResponse);
      setConnectionState('connected');
    } catch (err) {
      const apiError = err as { problemDetails?: ProblemDetails };
      setError(
        apiError.problemDetails || {
          status: 500,
          detail: 'Failed to connect to video room',
        },
      );
      setConnectionState('error');
      setTokenData(null);
      setSelectedRole(null);
    }
  };

  const handleLeave = () => {
    setTokenData(null);
    setSelectedRole(null);
    setConnectionState('idle');
    hasAutoJoinedRef.current = false;
  };

  const handleCloseConsultation = async () => {
    if (!consultationId || activeRole !== 'doctor') {
      return;
    }
    setClosing(true);
    setError(null);
    try {
      await closeConsultation(consultationId);
      navigate('/lobby');
    } catch (err) {
      const apiError = err as { problemDetails?: ProblemDetails };
      setError(
        apiError.problemDetails || {
          status: 500,
          detail: 'No se pudo finalizar la consulta',
        },
      );
    } finally {
      setClosing(false);
    }
  };

  // Auto-join for patient: when consultationId is available and role is patient
  // Patient automatically joins when navigating from lobby after consultation.started event
  useEffect(() => {
    if (
      !consultationId ||
      activeRole !== 'patient' ||
      !patientToken ||
      hasAutoJoinedRef.current ||
      connectionState !== 'idle'
    ) {
      return;
    }

    // Auto-join as patient (no button click needed)
    hasAutoJoinedRef.current = true;

    // Call handleJoin directly (avoiding dependency on handleJoin function)
    const performJoin = async () => {
      setConnectionState('loading');
      setError(null);
      setSelectedRole('patient');

      try {
        const tokenResponse = await getLivekitToken(consultationId, 'patient');
        setTokenData(tokenResponse);
        setConnectionState('connected');
      } catch (err) {
        const apiError = err as { problemDetails?: ProblemDetails };
        setError(
          apiError.problemDetails || {
            status: 500,
            detail: 'Failed to connect to video room',
          },
        );
        setConnectionState('error');
        setTokenData(null);
        setSelectedRole(null);
        hasAutoJoinedRef.current = false; // Allow retry
      }
    };

    void performJoin();
  }, [consultationId, activeRole, patientToken, connectionState]);

  // Load consultation and resolve chat thread
  useEffect(() => {
    const loadConsultationAndThread = async () => {
      if (!consultationId || !activeRole || connectionState !== 'connected') {
        return;
      }

      try {
        // Get consultation to determine otherUserId
        const consultationData = await getConsultation(consultationId);
        setConsultation(consultationData);

        // Determine otherUserId based on role
        const otherUserId =
          activeRole === 'doctor'
            ? consultationData.patientUserId
            : consultationData.doctorUserId;

        // Get or create thread
        const thread = await getOrCreateThread(otherUserId);
        setChatThread(thread);
        setChatError(null);
      } catch (err: unknown) {
        const apiError = err as { problemDetails?: ProblemDetails };
        if (apiError.problemDetails) {
          const status = apiError.problemDetails.status;
          if (status === 401 || status === 403) {
            setChatError(
              apiError.problemDetails.detail || 'Chat not available',
            );
          } else {
            setChatError('Failed to load chat');
          }
        } else {
          setChatError('Failed to load chat');
        }
        console.error('Failed to load consultation/thread:', err);
      }
    };

    void loadConsultationAndThread();
  }, [consultationId, activeRole, connectionState]);

  // Determine otherUser for chat
  const chatOtherUser = chatThread
    ? activeRole === 'doctor'
      ? chatThread.patient
      : chatThread.doctor
    : undefined;

  if (!consultationId) {
    return (
      <div style={{ padding: '20px' }}>
        <h1>Error</h1>
        <p>Consultation ID is missing</p>
        <button onClick={() => navigate('/lobby')}>Back to Lobby</button>
      </div>
    );
  }

  // Show join buttons if not connected
  if (connectionState !== 'connected') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          padding: '20px',
        }}
      >
        <h1>Consultation Room</h1>
        <p>Consultation ID: {consultationId}</p>

        {error && (
          <div
            style={{
              marginBottom: '16px',
              padding: '12px',
              backgroundColor: '#fee',
              border: '1px solid #fcc',
              borderRadius: '4px',
              color: '#c33',
              maxWidth: '500px',
            }}
          >
            <strong>Error:</strong> {error.detail}
            {error.errors && (
              <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                {Object.entries(error.errors).map(([field, messages]) => (
                  <li key={field}>
                    <strong>{field}:</strong> {messages.join(', ')}
                  </li>
                ))}
              </ul>
            )}
            {connectionState === 'error' && (
              <button
                onClick={() => {
                  setError(null);
                  setConnectionState('idle');
                }}
                style={{
                  marginTop: '8px',
                  padding: '6px 12px',
                  border: 'none',
                  borderRadius: '4px',
                  backgroundColor: '#007bff',
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                Retry
              </button>
            )}
          </div>
        )}

        {/* Join gating: show only button for activeRole */}
        {!activeRole ? (
          <div
            style={{
              marginTop: '16px',
              padding: '12px',
              backgroundColor: '#fff3cd',
              border: '1px solid #ffc107',
              borderRadius: '4px',
              color: '#856404',
            }}
          >
            Please login and select a role first.
          </div>
        ) : (
          <div style={{ marginTop: '16px' }}>
            {activeRole === 'doctor' && (
              <button
                onClick={() => void handleJoin('doctor')}
                disabled={
                  connectionState === 'loading' ||
                  connectionState === 'error' ||
                  !doctorToken
                }
                style={{
                  padding: '12px 24px',
                  border: 'none',
                  borderRadius: '4px',
                  backgroundColor:
                    connectionState === 'loading' || !doctorToken
                      ? '#ccc'
                      : '#007bff',
                  color: 'white',
                  cursor:
                    connectionState === 'loading' || !doctorToken
                      ? 'not-allowed'
                      : 'pointer',
                  fontSize: '16px',
                }}
              >
                Join as Doctor
                {!doctorToken && ' (No token available)'}
              </button>
            )}
            {activeRole === 'patient' && (
              <button
                onClick={() => void handleJoin('patient')}
                disabled={
                  connectionState === 'loading' ||
                  connectionState === 'error' ||
                  !patientToken
                }
                style={{
                  padding: '12px 24px',
                  border: 'none',
                  borderRadius: '4px',
                  backgroundColor:
                    connectionState === 'loading' || !patientToken
                      ? '#ccc'
                      : '#28a745',
                  color: 'white',
                  cursor:
                    connectionState === 'loading' || !patientToken
                      ? 'not-allowed'
                      : 'pointer',
                  fontSize: '16px',
                }}
              >
                Join as Patient
                {!patientToken && ' (No token available)'}
              </button>
            )}
          </div>
        )}

        <button
          onClick={() => navigate('/lobby')}
          style={{
            padding: '8px 16px',
            border: 'none',
            borderRadius: '4px',
            backgroundColor: '#6c757d',
            color: 'white',
            cursor: 'pointer',
            marginTop: '24px',
          }}
        >
          Back to Lobby
        </button>

        {connectionState === 'loading' && (
          <div style={{ marginTop: '16px' }}>Connecting...</div>
        )}
      </div>
    );
  }

  // Show video room when connected
  if (connectionState === 'connected' && tokenData) {
    // Debug logs (only in dev)
    if (import.meta.env.DEV) {
      console.log('[RoomPage] Rendering LiveKitRoom', {
        consultationId,
        activeRole,
        connectionState,
        roomName: tokenData.roomName,
        livekitUrl: tokenData.livekitUrl,
        hasToken: !!tokenData.token,
        tokenLength: tokenData.token?.length ?? 0,
        selectedRole,
      });
    }

    // Ensure we have all required data before rendering LiveKitRoom
    if (!tokenData.livekitUrl || !tokenData.token || !tokenData.roomName) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '100vh',
            padding: '20px',
          }}
        >
          <h2>Missing Room Data</h2>
          <p>Unable to connect: missing server URL, token, or room name.</p>
          <button
            onClick={handleLeave}
            style={{
              marginTop: '16px',
              padding: '8px 16px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: '#6c757d',
              color: 'white',
              cursor: 'pointer',
            }}
          >
            Go Back
          </button>
        </div>
      );
    }

    return (
      <RoomErrorBoundary>
        <div
          style={{
            width: '100%',
            height: '100vh',
            overflow: 'hidden',
            backgroundColor: '#000',
            position: 'relative',
          }}
        >
          <LiveKitRoom
            serverUrl={tokenData.livekitUrl}
            token={tokenData.token}
            video={true}
            audio={true}
            connect={true}
            onConnected={() => {
              if (import.meta.env.DEV) {
                console.log('[RoomPage] LiveKit connected successfully');
              }
            }}
            onDisconnected={(reason) => {
              if (import.meta.env.DEV) {
                console.log('[RoomPage] LiveKit disconnected:', reason);
              }
              // Don't navigate away automatically, just reset state
              // User can retry or manually go back
              setConnectionState('idle');
              setTokenData(null);
              setSelectedRole(null);
            }}
            style={{
              height: '100%',
              width: '100%',
            }}
          >
            {/* All LiveKit-dependent components MUST be inside LiveKitRoom */}
            <RoomLayout
              activeRole={activeRole}
              onCloseConsultation={() => void handleCloseConsultation()}
              closing={closing}
            />
          </LiveKitRoom>

          {/* External status bar (outside LiveKitRoom, no LiveKit hooks) */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '96px',
              borderTop: '1px solid #404040',
              backgroundColor: '#0a0a0a',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              padding: '0 16px',
              gap: '16px',
              zIndex: 100,
              pointerEvents: 'none', // Allow clicks to pass through to LiveKit controls
            }}
          >
            {/* Left: Connection status + IDs */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                minWidth: '200px',
                pointerEvents: 'auto', // Re-enable pointer events for this section
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
                <span>
                  {connectionState === 'connected' ? 'Connected' : 'Connecting'}
                </span>
              </div>
              <div style={{ fontSize: '12px', color: '#a3a3a3' }}>
                Consultation: {consultationId?.substring(0, 8)}...
              </div>
              <div style={{ fontSize: '12px', color: '#a3a3a3' }}>
                Role: {selectedRole || 'N/A'}
              </div>
            </div>

            {/* Right: Consultation status / timers placeholder */}
            <div
              style={{
                marginLeft: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                minWidth: '150px',
                alignItems: 'flex-end',
                pointerEvents: 'auto', // Re-enable pointer events for this section
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

          {/* Chat Drawer */}
          <ChatDrawer
            threadId={chatThread?.id ?? null}
            otherUser={chatOtherUser}
            autoConnect={true}
            autoJoin={true}
            error={chatError}
          />

          {/* Patient Files Drawer */}
          {consultation && (
            <PatientFilesDrawer
              patientId={
                activeRole === 'doctor' ? consultation.patientUserId : undefined
              }
              consultationId={consultation.id}
            />
          )}
        </div>
      </RoomErrorBoundary>
    );
  }

  // Loading state
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
      }}
    >
      <div>Connecting to room...</div>
      <button
        onClick={handleLeave}
        style={{
          padding: '8px 16px',
          border: 'none',
          borderRadius: '4px',
          backgroundColor: '#6c757d',
          color: 'white',
          cursor: 'pointer',
          marginTop: '16px',
        }}
      >
        Cancel
      </button>
    </div>
  );
}
