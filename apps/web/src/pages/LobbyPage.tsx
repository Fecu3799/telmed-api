import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { login, register, getMe, type AuthMeResponse } from '../api/auth';
import {
  getPatientIdentity,
  type PatientIdentity,
} from '../api/patient-identity';
import { getDoctorProfile, type DoctorProfile } from '../api/doctor-profile';
import { getOnlineStatus, goOffline, goOnline, pingOnline } from '../api/geo';
import {
  getActiveConsultation,
  type ConsultationStatus,
} from '../api/consultations';
import { notificationsSocket } from '../api/notifications-socket';
import { type ProblemDetails } from '../api/http';
import { PatientIdentityModal } from '../components/PatientIdentityModal';
import { DoctorProfileModal } from '../components/DoctorProfileModal';

export function LobbyPage() {
  const ONLINE_STORAGE_KEY = 'telmed.doctor.online';
  const navigate = useNavigate();
  const {
    doctorToken,
    patientToken,
    activeRole,
    setDoctorToken,
    setPatientToken,
    setActiveRole,
  } = useAuth();
  const activeToken =
    activeRole === 'doctor'
      ? doctorToken
      : activeRole === 'patient'
        ? patientToken
        : null;

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
  const [sessionCooldownUntil, setSessionCooldownUntil] = useState<number | null>(
    null,
  );
  const sessionInFlightRef = useRef(false);
  const lastSessionFetchRef = useRef<number | null>(null);

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
  const [presenceLoading, setPresenceLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [activeConsultationId, setActiveConsultationId] = useState<
    string | null
  >(null);
  const [activeConsultationStatus, setActiveConsultationStatus] =
    useState<ConsultationStatus | null>(null);

  // Error states
  const [error, setError] = useState<ProblemDetails | null>(null);

  // Load session status when activeRole changes
  // Sincroniza http client con el token del rol activo antes de hacer la llamada
  useEffect(() => {
    const loadSessionStatus = async () => {
      if (!activeToken) {
        setSessionStatus(null);
        setSessionError(null);
        return;
      }

      if (sessionInFlightRef.current) {
        return;
      }

      const now = Date.now();
      if (sessionCooldownUntil && now < sessionCooldownUntil) {
        return;
      }
      if (lastSessionFetchRef.current && now - lastSessionFetchRef.current < 15_000) {
        return;
      }

      sessionInFlightRef.current = true;
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
        const statusCode = apiError.problemDetails?.status;
        if (statusCode === 429) {
          const retryAt = Date.now() + 30_000;
          setSessionCooldownUntil(retryAt);
          setSessionError({
            status: 429,
            detail: 'Rate limited, reintentando...',
          });
          return;
        }
        setSessionError(
          apiError.problemDetails || {
            status: 500,
            detail: 'Failed to load session status',
          },
        );
      } finally {
        lastSessionFetchRef.current = Date.now();
        sessionInFlightRef.current = false;
        setLoadingSession(false);
      }
    };

    void loadSessionStatus();
  }, [activeRole, doctorToken, patientToken, activeToken, sessionCooldownUntil]);

  useEffect(() => {
    if (!sessionCooldownUntil) {
      return undefined;
    }
    const delay = Math.max(sessionCooldownUntil - Date.now(), 0);
    const timeout = window.setTimeout(() => {
      setSessionCooldownUntil(null);
    }, delay);
    return () => clearTimeout(timeout);
  }, [sessionCooldownUntil]);

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
        setIsOnline(false);
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

  useEffect(() => {
    const loadPresenceStatus = async () => {
      if (activeRole !== 'doctor' || !doctorToken) {
        setIsOnline(false);
        return;
      }
      const stored = localStorage.getItem(ONLINE_STORAGE_KEY);
      if (stored !== null) {
        setIsOnline(stored === 'true');
      }
      try {
        const status = await getOnlineStatus();
        setIsOnline(status.online);
        localStorage.setItem(ONLINE_STORAGE_KEY, String(status.online));
      } catch (err) {
        const apiError = err as {
          problemDetails?: ProblemDetails;
          status?: number;
        };
        setError(
          apiError.problemDetails || {
            status: apiError.status || 500,
            detail: 'No se pudo cargar el estado online',
          },
        );
        setIsOnline(false);
      }
    };

    void loadPresenceStatus();
  }, [activeRole, doctorToken]);

  useEffect(() => {
    const loadActiveConsultation = async () => {
      if (!activeToken) {
        setActiveConsultationId(null);
        setActiveConsultationStatus(null);
        return;
      }
      try {
        const response = await getActiveConsultation();
        setActiveConsultationId(response.consultation?.consultationId ?? null);
        setActiveConsultationStatus(response.consultation?.status ?? null);
      } catch {
        setActiveConsultationId(null);
        setActiveConsultationStatus(null);
      }
    };

    void loadActiveConsultation();
  }, [activeRole, doctorToken, patientToken, activeToken]);

  useEffect(() => {
    const token = activeToken;
    if (!token) {
      notificationsSocket.disconnect();
      return;
    }

    notificationsSocket.connect(token);
    const handleConsultationsChanged = () => {
      void (async () => {
        try {
          const response = await getActiveConsultation();
          setActiveConsultationId(
            response.consultation?.consultationId ?? null,
          );
          setActiveConsultationStatus(response.consultation?.status ?? null);
        } catch {
          setActiveConsultationId(null);
          setActiveConsultationStatus(null);
        }
      })();
    };

    notificationsSocket.onConsultationsChanged(handleConsultationsChanged);
    return () => {
      notificationsSocket.offConsultationsChanged(handleConsultationsChanged);
      notificationsSocket.disconnect();
    };
  }, [activeToken]);

  useEffect(() => {
    if (activeRole !== 'doctor' || !isOnline) {
      return undefined;
    }

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
  }, [activeRole, isOnline]);

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

  const handleTogglePresence = async () => {
    setPresenceLoading(true);
    setError(null);
    try {
      if (!isOnline) {
        await goOnline();
        setIsOnline(true);
        localStorage.setItem(ONLINE_STORAGE_KEY, 'true');
      } else {
        await goOffline();
        setIsOnline(false);
        localStorage.setItem(ONLINE_STORAGE_KEY, 'false');
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
      if (apiError.problemDetails?.status === 422) {
        setError({
          status: 422,
          detail: 'Configurá tu ubicación primero',
        });
      } else {
        setError(
          apiError.problemDetails || {
            status: apiError.status || 500,
            detail: 'No se pudo actualizar la presencia',
          },
        );
      }
    } finally {
      setPresenceLoading(false);
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
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}
      >
        <h1 style={{ margin: 0 }}>TelMed Lobby (Alpha v0)</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => navigate('/doctor-search')}
            style={{
              padding: '8px 16px',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.9em',
            }}
          >
            Buscar médicos
          </button>
          {activeConsultationId && (
            <button
              onClick={() => navigate(`/room/${activeConsultationId}`)}
              disabled={activeConsultationStatus !== 'in_progress'}
              style={{
                padding: '8px 16px',
                backgroundColor:
                  activeConsultationStatus === 'in_progress'
                    ? '#007bff'
                    : '#9ca3af',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor:
                  activeConsultationStatus === 'in_progress'
                    ? 'pointer'
                    : 'not-allowed',
                fontSize: '0.9em',
              }}
            >
              {activeConsultationStatus === 'in_progress'
                ? 'Entrar a consulta'
                : 'Consulta cerrada'}
            </button>
          )}
          <button
            onClick={() => navigate('/chats')}
            style={{
              padding: '8px 16px',
              backgroundColor: '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.9em',
            }}
          >
            Open Chats
          </button>
          {activeRole === 'patient' && (
            <button
              onClick={() => navigate('/patient-history')}
              style={{
                padding: '8px 16px',
                backgroundColor: '#6f42c1',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.9em',
              }}
            >
              Historia Clínica
            </button>
          )}
        </div>
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
          <div
            style={{
              marginTop: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <button
              onClick={() => navigate('/patient-files')}
              style={{
                ...buttonStyle,
                backgroundColor: '#4CAF50',
              }}
            >
              📁 Biblioteca de Archivos
            </button>
            <button
              onClick={() => navigate('/appointments')}
              style={{
                ...buttonStyle,
                backgroundColor: '#007bff',
              }}
            >
              Mis Turnos
            </button>
            <button
              onClick={() => navigate('/geo-nearby')}
              style={{
                ...buttonStyle,
                backgroundColor: '#ff5722',
              }}
            >
              Doctores cerca
            </button>
          </div>
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
          <div
            style={{
              marginTop: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <button
              onClick={() => void handleTogglePresence()}
              disabled={presenceLoading}
              style={{
                ...buttonStyle,
                backgroundColor: isOnline ? '#dc3545' : '#28a745',
              }}
            >
              {presenceLoading
                ? 'Actualizando...'
                : isOnline
                  ? 'Pasar offline'
                  : 'Pasar online'}
            </button>
            <button
              onClick={() => navigate('/doctor-availability')}
              style={{
                ...buttonStyle,
                backgroundColor: '#17a2b8',
              }}
            >
              Mi Disponibilidad
            </button>
            <button
              onClick={() => navigate('/doctor-location')}
              style={{
                ...buttonStyle,
                backgroundColor: '#ff9800',
              }}
            >
              Mi ubicación
            </button>
            <button
              onClick={() => navigate('/appointments')}
              style={{
                ...buttonStyle,
                backgroundColor: '#007bff',
              }}
            >
              Mis Turnos
            </button>
            <button
              onClick={() => navigate('/doctor-patients')}
              style={{
                ...buttonStyle,
                backgroundColor: '#6f42c1',
              }}
            >
              Mis Pacientes
            </button>
          </div>
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
