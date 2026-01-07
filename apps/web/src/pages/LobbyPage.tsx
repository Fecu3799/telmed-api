import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { login, register, getMe, type AuthMeResponse } from '../api/auth';
import {
  getPatientIdentity,
  type PatientIdentity,
} from '../api/patient-identity';
import { getDoctorProfile, type DoctorProfile } from '../api/doctor-profile';
import {
  createQueue,
  getQueue,
  listQueue,
  acceptQueue,
  payForQueue,
  startQueue,
  type ConsultationQueueItem,
} from '../api/queue';
import { type ProblemDetails } from '../api/http';
import { consultationSocket } from '../api/socket';
import { PatientIdentityModal } from '../components/PatientIdentityModal';
import { DoctorProfileModal } from '../components/DoctorProfileModal';

export function LobbyPage() {
  const navigate = useNavigate();
  const {
    doctorToken,
    patientToken,
    activeRole,
    setDoctorToken,
    setPatientToken,
    setActiveRole,
    getActiveToken,
  } = useAuth();

  // Demo credentials state
  const [doctorEmail, setDoctorEmail] = useState('doctor.demo@telmed.test');
  const [doctorPassword, setDoctorPassword] = useState('Pass123!');
  const [patientEmail, setPatientEmail] = useState('patient.demo@telmed.test');
  const [patientPassword, setPatientPassword] = useState('Pass123!');

  // Session status
  const [sessionStatus, setSessionStatus] = useState<AuthMeResponse | null>(
    null,
  );
  const [loadingSession, setLoadingSession] = useState(false);
  const [sessionError, setSessionError] = useState<ProblemDetails | null>(null);

  // Patient identity
  const [patientIdentity, setPatientIdentity] =
    useState<PatientIdentity | null>(null);
  const [loadingIdentity, setLoadingIdentity] = useState(false);
  const [identityModalOpen, setIdentityModalOpen] = useState(false);

  // Doctor profile
  const [doctorProfile, setDoctorProfile] = useState<DoctorProfile | null>(
    null,
  );
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  // Emergency (Patient)
  const [emergencyDoctorUserId, setEmergencyDoctorUserId] = useState('');
  const [emergencyReason, setEmergencyReason] = useState('');
  const [emergencyQueue, setEmergencyQueue] =
    useState<ConsultationQueueItem | null>(null);
  const [loadingEmergency, setLoadingEmergency] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [waitingForDoctor, setWaitingForDoctor] = useState(false);

  // WebSocket debug states
  const [socketConnected, setSocketConnected] = useState(false);
  const [subscribedQueueId, setSubscribedQueueId] = useState<string | null>(
    null,
  );
  const [lastEvent, setLastEvent] = useState<{
    type: string;
    timestamp: string;
    payload?: unknown;
  } | null>(null);

  // Emergency (Doctor)
  const [queueItems, setQueueItems] = useState<ConsultationQueueItem[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(false);

  // Error states
  const [error, setError] = useState<ProblemDetails | null>(null);

  // Load session status when activeRole changes
  // Sincroniza http client con el token del rol activo antes de hacer la llamada
  useEffect(() => {
    const loadSessionStatus = async () => {
      if (!getActiveToken()) {
        setSessionStatus(null);
        setSessionError(null);
        return;
      }

      setLoadingSession(true);
      setSessionError(null);
      try {
        const status = await getMe();
        setSessionStatus(status);
        setSessionError(null);
      } catch (err) {
        setSessionStatus(null);
        // Show error details for debugging
        const apiError = err as { problemDetails?: ProblemDetails };
        setSessionError(
          apiError.problemDetails || {
            status: 500,
            detail: 'Failed to load session status',
          },
        );
      } finally {
        setLoadingSession(false);
      }
    };

    void loadSessionStatus();
  }, [activeRole, doctorToken, patientToken, getActiveToken]);

  // Load patient identity when activeRole is patient
  useEffect(() => {
    const loadIdentity = async () => {
      if (activeRole !== 'patient' || !patientToken) {
        setPatientIdentity(null);
        return;
      }

      setLoadingIdentity(true);
      try {
        const identity = await getPatientIdentity();
        setPatientIdentity(identity);
      } catch (err) {
        if ((err as { status?: number }).status === 404) {
          setPatientIdentity(null);
        }
      } finally {
        setLoadingIdentity(false);
      }
    };

    void loadIdentity();
  }, [activeRole, patientToken]);

  // Load doctor profile when activeRole is doctor
  useEffect(() => {
    const loadProfile = async () => {
      if (activeRole !== 'doctor' || !doctorToken) {
        setDoctorProfile(null);
        return;
      }

      setLoadingProfile(true);
      try {
        const profile = await getDoctorProfile();
        setDoctorProfile(profile);
      } catch (err) {
        if ((err as { status?: number }).status === 404) {
          setDoctorProfile(null);
        }
      } finally {
        setLoadingProfile(false);
      }
    };

    void loadProfile();
  }, [activeRole, doctorToken]);

  // Load queue when activeRole is doctor
  useEffect(() => {
    const loadQueue = async () => {
      if (activeRole !== 'doctor' || !doctorToken) {
        setQueueItems([]);
        return;
      }

      setLoadingQueue(true);
      try {
        const items = await listQueue(false);
        setQueueItems(items);
      } catch {
        setQueueItems([]);
      } finally {
        setLoadingQueue(false);
      }
    };

    void loadQueue();
  }, [activeRole, doctorToken]);

  // WebSocket: connect and track connection state
  useEffect(() => {
    const token = getActiveToken();
    if (!token) {
      consultationSocket.disconnect();
      setSocketConnected(false);
      return;
    }

    // Connect socket with current token
    consultationSocket.connect(token);

    // Track connection state for debug panel
    const checkConnection = () => {
      setSocketConnected(consultationSocket.isConnected());
    };

    // Check immediately and periodically
    checkConnection();
    const interval = setInterval(checkConnection, 1000);

    return () => {
      clearInterval(interval);
      consultationSocket.disconnect();
      setSocketConnected(false);
    };
  }, [getActiveToken, activeRole, doctorToken, patientToken]);

  // WebSocket: subscribe to queue and listen for consultation.started event
  // Event-driven approach: patient subscribes to queueItemId, receives event when doctor starts
  //
  // VALIDATION MANUAL CHECKLIST:
  // 1. Abrir front como patient, crear emergency
  // 2. Aunque el socket tarde en conectar, debe terminar suscribiéndose (ver logs en DevTools)
  // 3. Doctor hace start
  // 4. Patient recibe `consultation:started` y navega automático a /room/:consultationId
  const queueItemIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Only for patients waiting for consultation to start
    if (activeRole !== 'patient' || !emergencyQueue?.id) {
      const oldQueueItemId = queueItemIdRef.current;
      queueItemIdRef.current = null;
      setWaitingForDoctor(false);
      if (oldQueueItemId) {
        consultationSocket.unsubscribeFromQueue(oldQueueItemId);
      }
      setSubscribedQueueId(null);
      return;
    }

    // Don't listen if consultation is already in progress or finalized
    if (
      emergencyQueue.consultationId ||
      emergencyQueue.status === 'in_progress' ||
      emergencyQueue.status === 'finalized'
    ) {
      const oldQueueItemId = queueItemIdRef.current;
      queueItemIdRef.current = null;
      setWaitingForDoctor(false);
      if (oldQueueItemId) {
        consultationSocket.unsubscribeFromQueue(oldQueueItemId);
      }
      setSubscribedQueueId(null);
      return;
    }

    // Subscribe to queue item if not already subscribed
    // Always call subscribeToQueue (it's eventually consistent: will subscribe when socket connects)
    if (queueItemIdRef.current !== emergencyQueue.id) {
      // Unsubscribe from previous queue item if changing
      if (queueItemIdRef.current) {
        consultationSocket.unsubscribeFromQueue(queueItemIdRef.current);
      }

      queueItemIdRef.current = emergencyQueue.id;
      setSubscribedQueueId(emergencyQueue.id);
      setWaitingForDoctor(true);

      // Subscribe to queue item updates via WebSocket
      // This is eventually consistent: if socket is not connected yet, it will subscribe on connect
      consultationSocket.subscribeToQueue(emergencyQueue.id, (response) => {
        if (response.ok) {
          if (import.meta.env.DEV) {
            console.log('[Socket] Subscribed to queue:', emergencyQueue.id);
          }
          setLastEvent({
            type: 'queue:subscribe',
            timestamp: new Date().toISOString(),
            payload: response,
          });
        } else {
          if (import.meta.env.DEV) {
            console.error(
              '[Socket] Failed to subscribe to queue:',
              response.error,
            );
          }
        }
      });
    }

    // Listen for consultation.started event (new event-driven contract)
    const handleConsultationStarted = (payload: {
      queueItemId: string;
      consultationId: string;
      roomName: string;
      livekitUrl: string;
      startedAt: string;
    }) => {
      // Verify this event is for our queue item
      if (payload.queueItemId !== emergencyQueue.id) {
        if (import.meta.env.DEV) {
          console.warn(
            '[Socket] Received consultation:started for different queue:',
            payload.queueItemId,
            'expected:',
            emergencyQueue.id,
          );
        }
        return;
      }

      if (import.meta.env.DEV) {
        console.log('[Socket] Received consultation:started:', payload);
      }

      // Track event for debug panel
      setLastEvent({
        type: 'consultation.started',
        timestamp: new Date().toISOString(),
        payload,
      });

      // Navigate automatically to room
      navigate(`/room/${payload.consultationId}`);
      setWaitingForDoctor(false);
      // Unsubscribe from the queue item that just started
      consultationSocket.unsubscribeFromQueue(payload.queueItemId);
      setSubscribedQueueId(null);
    };

    consultationSocket.onConsultationStarted(handleConsultationStarted);

    return () => {
      consultationSocket.offConsultationStarted(handleConsultationStarted);
      // Unsubscribe from current queue item on cleanup
      if (queueItemIdRef.current) {
        consultationSocket.unsubscribeFromQueue(queueItemIdRef.current);
      }
      setSubscribedQueueId(null);
      setWaitingForDoctor(false);
    };
  }, [
    activeRole,
    emergencyQueue?.id,
    emergencyQueue?.consultationId,
    emergencyQueue?.status,
    navigate,
  ]);

  const handleLoginDoctor = async () => {
    setError(null);
    try {
      const response = await login({
        email: doctorEmail,
        password: doctorPassword,
      });
      setDoctorToken(response.accessToken);
      if (!activeRole) {
        setActiveRole('doctor');
      }
    } catch (err) {
      const apiError = err as { problemDetails?: ProblemDetails };
      setError(
        apiError.problemDetails || { status: 500, detail: 'Login failed' },
      );
    }
  };

  const handleLoginPatient = async () => {
    setError(null);
    try {
      const response = await login({
        email: patientEmail,
        password: patientPassword,
      });
      setPatientToken(response.accessToken);
      if (!activeRole) {
        setActiveRole('patient');
      }
    } catch (err) {
      const apiError = err as { problemDetails?: ProblemDetails };
      setError(
        apiError.problemDetails || { status: 500, detail: 'Login failed' },
      );
    }
  };

  const handleRegisterDemo = async () => {
    setError(null);
    try {
      // Register doctor
      try {
        await register({
          email: doctorEmail,
          password: doctorPassword,
          role: 'doctor',
        });
      } catch (err: unknown) {
        const apiError = err as { problemDetails?: ProblemDetails };
        if (apiError.problemDetails?.status !== 409) {
          throw err;
        }
      }

      // Register patient
      try {
        await register({
          email: patientEmail,
          password: patientPassword,
          role: 'patient',
        });
      } catch (err: unknown) {
        const apiError = err as { problemDetails?: ProblemDetails };
        if (apiError.problemDetails?.status !== 409) {
          throw err;
        }
      }
    } catch (err) {
      const apiError = err as { problemDetails?: ProblemDetails };
      setError(
        apiError.problemDetails || {
          status: 500,
          detail: 'Registration failed',
        },
      );
    }
  };

  const handleCreateEmergency = async () => {
    if (!emergencyDoctorUserId || !emergencyReason) {
      setError({ status: 400, detail: 'Doctor ID and reason are required' });
      return;
    }

    setLoadingEmergency(true);
    setError(null);
    setCheckoutUrl(null);
    setCopied(false);
    try {
      const queue = await createQueue({
        doctorUserId: emergencyDoctorUserId,
        reason: emergencyReason,
      });
      setEmergencyQueue(queue);
      // Store queueItemId in localStorage for dev (optional)
      if (import.meta.env.DEV) {
        localStorage.setItem('telmed.queueItemId', queue.id);
      }
    } catch (err) {
      const apiError = err as { problemDetails?: ProblemDetails };
      setError(
        apiError.problemDetails || {
          status: 500,
          detail: 'Failed to create emergency',
        },
      );
    } finally {
      setLoadingEmergency(false);
    }
  };

  const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
      // Try modern clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      // Fallback: use execCommand
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textArea);
      return success;
    } catch {
      return false;
    }
  };

  const handlePayEmergency = async () => {
    if (!emergencyQueue) return;

    setLoadingEmergency(true);
    setError(null);
    setCopied(false);
    try {
      const payment = await payForQueue(emergencyQueue.id);
      setCheckoutUrl(payment.checkoutUrl);

      // Try to copy to clipboard
      const copySuccess = await copyToClipboard(payment.checkoutUrl);
      if (copySuccess) {
        setCopied(true);
      }

      // Refresh queue status
      const updated = await getQueue(emergencyQueue.id);
      setEmergencyQueue(updated);
    } catch (err) {
      const apiError = err as { problemDetails?: ProblemDetails };
      setError(
        apiError.problemDetails || {
          status: 500,
          detail: 'Failed to create payment',
        },
      );
    } finally {
      setLoadingEmergency(false);
    }
  };

  const handleCopyAgain = async () => {
    if (!checkoutUrl) return;
    const success = await copyToClipboard(checkoutUrl);
    if (success) {
      setCopied(true);
      // Reset copied state after 3 seconds
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const handleRefreshEmergency = async () => {
    if (!emergencyQueue) return;

    setLoadingEmergency(true);
    try {
      const updated = await getQueue(emergencyQueue.id);
      setEmergencyQueue(updated);
    } catch {
      // Ignore errors
    } finally {
      setLoadingEmergency(false);
    }
  };

  const handleAcceptQueue = async (queueItemId: string) => {
    setLoadingQueue(true);
    setError(null);
    try {
      await acceptQueue(queueItemId);
      const items = await listQueue(false);
      setQueueItems(items);
    } catch (err) {
      const apiError = err as { problemDetails?: ProblemDetails };
      setError(
        apiError.problemDetails || {
          status: 500,
          detail: 'Failed to accept queue',
        },
      );
    } finally {
      setLoadingQueue(false);
    }
  };

  const handleStartQueue = async (queueItemId: string) => {
    setLoadingQueue(true);
    setError(null);
    try {
      const result = await startQueue(queueItemId);
      navigate(`/room/${result.consultation.id}`);
    } catch (err) {
      const apiError = err as { problemDetails?: ProblemDetails };
      setError(
        apiError.problemDetails || {
          status: 500,
          detail: 'Failed to start consultation',
        },
      );
    } finally {
      setLoadingQueue(false);
    }
  };

  const handleRefreshQueue = async () => {
    setLoadingQueue(true);
    try {
      const items = await listQueue(false);
      setQueueItems(items);
    } catch {
      // Ignore errors
    } finally {
      setLoadingQueue(false);
    }
  };

  const sectionStyle = {
    border: '1px solid #ddd',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px',
  };

  const buttonStyle = {
    padding: '8px 16px',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: '#007bff',
    color: 'white',
    cursor: 'pointer',
    marginRight: '8px',
    marginBottom: '8px',
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>TelMed Lobby (Alpha v0)</h1>

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
          {error.detail}
          {error.errors && (
            <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
              {Object.entries(error.errors).map(([field, messages]) => (
                <li key={field}>
                  <strong>{field}:</strong> {messages.join(', ')}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Session Selector */}
      <div style={sectionStyle}>
        <h2>Active Session</h2>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <button
            onClick={() => setActiveRole('doctor')}
            disabled={!doctorToken}
            style={{
              ...buttonStyle,
              backgroundColor: activeRole === 'doctor' ? '#28a745' : '#6c757d',
            }}
          >
            Use Doctor Session
          </button>
          <button
            onClick={() => setActiveRole('patient')}
            disabled={!patientToken}
            style={{
              ...buttonStyle,
              backgroundColor: activeRole === 'patient' ? '#28a745' : '#6c757d',
            }}
          >
            Use Patient Session
          </button>
        </div>
        <div>
          <strong>Active Role:</strong> {activeRole || 'None'}
        </div>
      </div>

      {/* Demo Credentials */}
      <div style={sectionStyle}>
        <h2>Demo Credentials</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '16px',
            marginBottom: '16px',
          }}
        >
          <div>
            <h3>Doctor</h3>
            <div style={{ marginBottom: '8px' }}>
              <label style={{ display: 'block', marginBottom: '4px' }}>
                Email
              </label>
              <input
                type="email"
                value={doctorEmail}
                onChange={(e) => setDoctorEmail(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                }}
              />
            </div>
            <div style={{ marginBottom: '8px' }}>
              <label style={{ display: 'block', marginBottom: '4px' }}>
                Password
              </label>
              <input
                type="password"
                value={doctorPassword}
                onChange={(e) => setDoctorPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                }}
              />
            </div>
            <button
              onClick={() => void handleLoginDoctor()}
              style={buttonStyle}
            >
              Login Doctor
            </button>
          </div>
          <div>
            <h3>Patient</h3>
            <div style={{ marginBottom: '8px' }}>
              <label style={{ display: 'block', marginBottom: '4px' }}>
                Email
              </label>
              <input
                type="email"
                value={patientEmail}
                onChange={(e) => setPatientEmail(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                }}
              />
            </div>
            <div style={{ marginBottom: '8px' }}>
              <label style={{ display: 'block', marginBottom: '4px' }}>
                Password
              </label>
              <input
                type="password"
                value={patientPassword}
                onChange={(e) => setPatientPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                }}
              />
            </div>
            <button
              onClick={() => void handleLoginPatient()}
              style={buttonStyle}
            >
              Login Patient
            </button>
          </div>
        </div>
        <button
          onClick={() => void handleRegisterDemo()}
          style={{ ...buttonStyle, backgroundColor: '#6c757d' }}
        >
          Register Demo Users
        </button>
      </div>

      {/* Session Status */}
      <div style={sectionStyle}>
        <h2>Session Status</h2>
        {loadingSession ? (
          <div>Loading...</div>
        ) : sessionError ? (
          <div
            style={{
              padding: '12px',
              backgroundColor: '#fee',
              border: '1px solid #fcc',
              borderRadius: '4px',
              color: '#c33',
            }}
          >
            <strong>Error {sessionError.status}:</strong> {sessionError.detail}
            {sessionError.errors && (
              <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                {Object.entries(sessionError.errors).map(
                  ([field, messages]) => (
                    <li key={field}>
                      <strong>{field}:</strong> {messages.join(', ')}
                    </li>
                  ),
                )}
              </ul>
            )}
          </div>
        ) : sessionStatus ? (
          <div>
            <div>
              <strong>User ID:</strong> {sessionStatus.id}
            </div>
            <div>
              <strong>Role:</strong> {sessionStatus.role}
            </div>
            {sessionStatus.hasPatientIdentity !== undefined && (
              <div>
                <strong>Has Patient Identity:</strong>{' '}
                {sessionStatus.hasPatientIdentity ? 'Yes' : 'No'}
              </div>
            )}
          </div>
        ) : (
          <div>No active session</div>
        )}
      </div>

      {/* Patient Identity Checklist */}
      {activeRole === 'patient' && (
        <div style={sectionStyle}>
          <h2>Patient Identity Checklist</h2>
          {loadingIdentity ? (
            <div>Loading...</div>
          ) : patientIdentity ? (
            <div>
              <div style={{ color: '#28a745', marginBottom: '8px' }}>
                ✓ Complete
              </div>
              <div>
                <strong>Name:</strong> {patientIdentity.legalFirstName}{' '}
                {patientIdentity.legalLastName}
              </div>
              <div>
                <strong>Document:</strong> {patientIdentity.documentType}{' '}
                {patientIdentity.documentNumber}
              </div>
            </div>
          ) : (
            <div>
              <div style={{ color: '#dc3545', marginBottom: '8px' }}>
                ✗ Incomplete
              </div>
              <button
                onClick={() => setIdentityModalOpen(true)}
                style={buttonStyle}
              >
                Complete Now
              </button>
            </div>
          )}
        </div>
      )}

      {/* Doctor Profile Checklist */}
      {activeRole === 'doctor' && (
        <div style={sectionStyle}>
          <h2>Doctor Profile Checklist</h2>
          {loadingProfile ? (
            <div>Loading...</div>
          ) : doctorProfile ? (
            <div>
              <div style={{ color: '#28a745', marginBottom: '8px' }}>
                ✓ Complete
              </div>
              <div>
                <strong>Name:</strong> {doctorProfile.firstName}{' '}
                {doctorProfile.lastName}
              </div>
              <div>
                <strong>Price:</strong> $
                {(doctorProfile.priceCents / 100).toFixed(2)}{' '}
                {doctorProfile.currency}
              </div>
            </div>
          ) : (
            <div>
              <div style={{ color: '#dc3545', marginBottom: '8px' }}>
                ✗ Incomplete
              </div>
              <button
                onClick={() => setProfileModalOpen(true)}
                style={buttonStyle}
              >
                Complete Now
              </button>
            </div>
          )}
        </div>
      )}

      {/* Emergency (Patient) */}
      {activeRole === 'patient' && (
        <div style={sectionStyle}>
          <h2>Emergency (Patient)</h2>
          <div style={{ marginBottom: '8px' }}>
            <label style={{ display: 'block', marginBottom: '4px' }}>
              Doctor User ID *
            </label>
            <input
              type="text"
              value={emergencyDoctorUserId}
              onChange={(e) => setEmergencyDoctorUserId(e.target.value)}
              placeholder="UUID del doctor"
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
            />
          </div>
          <div style={{ marginBottom: '8px' }}>
            <label style={{ display: 'block', marginBottom: '4px' }}>
              Reason *
            </label>
            <textarea
              value={emergencyReason}
              onChange={(e) => setEmergencyReason(e.target.value)}
              placeholder="Motivo de la emergencia"
              rows={3}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
            />
          </div>
          <button
            onClick={() => void handleCreateEmergency()}
            disabled={
              loadingEmergency || !emergencyDoctorUserId || !emergencyReason
            }
            style={{
              ...buttonStyle,
              backgroundColor: loadingEmergency ? '#ccc' : '#007bff',
            }}
          >
            Create Emergency
          </button>

          {emergencyQueue && (
            <div
              style={{
                marginTop: '16px',
                padding: '12px',
                backgroundColor: '#f5f5f5',
                borderRadius: '4px',
              }}
            >
              <div>
                <strong>Queue ID:</strong> {emergencyQueue.id}
              </div>
              <div>
                <strong>Status:</strong> {emergencyQueue.status}
              </div>
              <div>
                <strong>Payment Status:</strong> {emergencyQueue.paymentStatus}
              </div>
              {emergencyQueue.paymentStatus === 'pending' && (
                <>
                  {!checkoutUrl ? (
                    <button
                      onClick={() => void handlePayEmergency()}
                      disabled={loadingEmergency}
                      style={{ ...buttonStyle, marginTop: '8px' }}
                    >
                      Pay
                    </button>
                  ) : (
                    <div style={{ marginTop: '8px' }}>
                      {copied && (
                        <div
                          style={{
                            marginBottom: '8px',
                            padding: '8px',
                            backgroundColor: '#d4edda',
                            border: '1px solid #c3e6cb',
                            borderRadius: '4px',
                            color: '#155724',
                          }}
                        >
                          ✅ Link copiado, abrilo en incógnito
                        </div>
                      )}
                      <div
                        style={{
                          display: 'flex',
                          gap: '8px',
                          marginBottom: '8px',
                        }}
                      >
                        <input
                          type="text"
                          readOnly
                          value={checkoutUrl}
                          style={{
                            flex: 1,
                            padding: '8px',
                            border: '1px solid #ccc',
                            borderRadius: '4px',
                            backgroundColor: '#f8f9fa',
                          }}
                          onFocus={(e) => e.target.select()}
                        />
                        <button
                          onClick={() => void handleCopyAgain()}
                          style={{
                            ...buttonStyle,
                            backgroundColor: '#28a745',
                          }}
                        >
                          Copiar de nuevo
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
              {/* Show waiting state when polling */}
              {waitingForDoctor && (
                <div
                  style={{
                    marginTop: '8px',
                    padding: '8px',
                    backgroundColor: '#fff3cd',
                    border: '1px solid #ffc107',
                    borderRadius: '4px',
                    color: '#856404',
                  }}
                >
                  Waiting for doctor to start... (WebSocket listening)
                </div>
              )}
              {/* Manual fallback: check queue status manually */}
              {waitingForDoctor && (
                <button
                  onClick={() => {
                    void (async () => {
                      if (!emergencyQueue?.id) return;
                      try {
                        const updated = await getQueue(emergencyQueue.id);
                        setEmergencyQueue(updated);
                        if (updated.consultationId) {
                          navigate(`/room/${updated.consultationId}`);
                        }
                      } catch (err) {
                        if (import.meta.env.DEV) {
                          console.error('Manual queue check error:', err);
                        }
                      }
                    })();
                  }}
                  style={{
                    ...buttonStyle,
                    marginTop: '8px',
                    backgroundColor: '#6c757d',
                    fontSize: '12px',
                    padding: '6px 12px',
                  }}
                >
                  Check Status (Fallback)
                </button>
              )}
              {/* Manual "Enter Room" button - only show if consultation is ready */}
              {emergencyQueue.consultationId && (
                <button
                  onClick={() =>
                    navigate(`/room/${emergencyQueue.consultationId}`)
                  }
                  style={{
                    ...buttonStyle,
                    marginTop: '8px',
                    backgroundColor: '#28a745',
                  }}
                >
                  Enter Room
                </button>
              )}
              {/* Debug panel (dev only) */}
              {import.meta.env.DEV && (
                <div
                  style={{
                    marginTop: '16px',
                    padding: '12px',
                    backgroundColor: '#f8f9fa',
                    border: '1px solid #dee2e6',
                    borderRadius: '4px',
                    fontSize: '12px',
                  }}
                >
                  <strong>Socket Debug (Dev Only):</strong>
                  <div style={{ marginTop: '4px' }}>
                    <strong>Connected:</strong> {socketConnected ? '✅' : '❌'}
                  </div>
                  <div>
                    <strong>Subscribed Queue:</strong>{' '}
                    {subscribedQueueId || 'None'}
                  </div>
                  {lastEvent && (
                    <div style={{ marginTop: '4px' }}>
                      <strong>Last Event:</strong> {lastEvent.type} @{' '}
                      {new Date(lastEvent.timestamp).toLocaleTimeString()}
                    </div>
                  )}
                </div>
              )}
              <button
                onClick={() => void handleRefreshEmergency()}
                style={{
                  ...buttonStyle,
                  marginTop: '8px',
                  backgroundColor: '#6c757d',
                }}
              >
                Refresh Status
              </button>
            </div>
          )}
        </div>
      )}

      {/* Emergency (Doctor) */}
      {activeRole === 'doctor' && (
        <div style={sectionStyle}>
          <h2>Emergency (Doctor)</h2>
          <button
            onClick={() => void handleRefreshQueue()}
            disabled={loadingQueue}
            style={{ ...buttonStyle, marginBottom: '16px' }}
          >
            Refresh Queue
          </button>
          {loadingQueue ? (
            <div>Loading...</div>
          ) : queueItems.length === 0 ? (
            <div>No queue items</div>
          ) : (
            <div>
              {queueItems.map((item) => (
                <div
                  key={item.id}
                  style={{
                    marginBottom: '16px',
                    padding: '12px',
                    backgroundColor: '#f5f5f5',
                    borderRadius: '4px',
                  }}
                >
                  <div>
                    <strong>Queue ID:</strong> {item.id}
                  </div>
                  <div>
                    <strong>Patient ID:</strong> {item.patientUserId}
                  </div>
                  <div>
                    <strong>Reason:</strong> {item.reason || 'N/A'}
                  </div>
                  <div>
                    <strong>Status:</strong> {item.status}
                  </div>
                  <div>
                    <strong>Entry Type:</strong> {item.entryType}
                  </div>
                  <div>
                    <strong>Payment Status:</strong> {item.paymentStatus}
                  </div>
                  {item.entryType === 'emergency' &&
                    item.status === 'queued' && (
                      <button
                        onClick={() => void handleAcceptQueue(item.id)}
                        style={{ ...buttonStyle, marginTop: '8px' }}
                      >
                        Accept
                      </button>
                    )}
                  {(item.status === 'accepted' ||
                    (item.entryType === 'emergency' &&
                      item.paymentStatus === 'paid')) && (
                    <button
                      onClick={() => void handleStartQueue(item.id)}
                      style={{
                        ...buttonStyle,
                        marginTop: '8px',
                        backgroundColor: '#28a745',
                      }}
                    >
                      Start
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <PatientIdentityModal
        isOpen={identityModalOpen}
        onClose={() => setIdentityModalOpen(false)}
        onSuccess={() => {
          // Reload identity
          const loadIdentity = async () => {
            setLoadingIdentity(true);
            try {
              const identity = await getPatientIdentity();
              setPatientIdentity(identity);
            } catch {
              setPatientIdentity(null);
            } finally {
              setLoadingIdentity(false);
            }
          };
          void loadIdentity();
        }}
      />

      <DoctorProfileModal
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        onSuccess={() => {
          // Reload profile
          const loadProfile = async () => {
            setLoadingProfile(true);
            try {
              const profile = await getDoctorProfile();
              setDoctorProfile(profile);
            } catch {
              setDoctorProfile(null);
            } finally {
              setLoadingProfile(false);
            }
          };
          void loadProfile();
        }}
      />
    </div>
  );
}
