import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  ControlBar,
  GridLayout,
  ParticipantTile,
  useTracks,
} from '@livekit/components-react';
import { Track } from 'livekit-client';

// Component to render video grid
function VideoGrid() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  return (
    <GridLayout tracks={tracks}>
      <ParticipantTile />
    </GridLayout>
  );
}
import { getLivekitToken, type LiveKitTokenResponse } from '../api/livekit';
import { type ProblemDetails } from '../api/http';
import { useAuth } from '../auth/AuthContext';

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
    return (
      <div
        style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}
      >
        <div
          style={{
            padding: '16px',
            backgroundColor: '#f5f5f5',
            borderBottom: '1px solid #ddd',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h2 style={{ margin: 0 }}>Consultation Room</h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#666' }}>
              Room: {tokenData.roomName} | Role: {selectedRole} | Token:{' '}
              {tokenData.token.substring(0, 8)}...
            </p>
          </div>
          <button
            onClick={handleLeave}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: '#dc3545',
              color: 'white',
              cursor: 'pointer',
            }}
          >
            Leave
          </button>
        </div>

        <div style={{ flex: 1, position: 'relative' }}>
          <LiveKitRoom
            serverUrl={tokenData.livekitUrl}
            token={tokenData.token}
            video={true}
            audio={true}
            connect={true}
            onDisconnected={() => {
              // Don't navigate away automatically, just reset state
              // User can retry or manually go back
              setConnectionState('idle');
              setTokenData(null);
              setSelectedRole(null);
            }}
            style={{ height: '100%', width: '100%' }}
          >
            <RoomAudioRenderer />
            <VideoGrid />
            <ControlBar />
          </LiveKitRoom>
        </div>
      </div>
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
