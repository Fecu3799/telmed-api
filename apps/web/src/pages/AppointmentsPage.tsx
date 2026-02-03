import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  listPatientAppointments,
  listDoctorAppointments,
  payAppointment,
  cancelAppointment,
  type Appointment,
  type AppointmentsResponse,
  type PaymentCheckout,
} from '../api/appointments';
import {
  listDoctorEmergencies,
  listPatientEmergencies,
  type EmergencyItem,
  type EmergenciesResponse,
} from '../api/emergencies';
import {
  acceptQueue,
  payForQueue,
  rejectQueue,
  startQueue,
} from '../api/queue';
import {
  getPaymentQuote,
  type PaymentQuoteRequest,
  type PaymentQuoteResponse,
} from '../api/payments';
import { type ProblemDetails } from '../api/http';
import { notificationsSocket } from '../api/notifications-socket';

// Badge component matching ClinicalProfileListSection pattern
function Badge({
  label,
  tone,
}: {
  label: string;
  tone?: 'success' | 'warning' | 'error' | 'info' | 'neutral';
}) {
  const colorMap: Record<string, { background: string; color: string }> = {
    success: { background: '#dcfce7', color: '#166534' },
    warning: { background: '#fef3c7', color: '#92400e' },
    error: { background: '#fee2e2', color: '#991b1b' },
    info: { background: '#dbeafe', color: '#1e40af' },
    neutral: { background: '#f3f4f6', color: '#374151' },
  };
  const palette = tone ? colorMap[tone] : colorMap.neutral;
  return (
    <span
      style={{
        padding: '2px 8px',
        borderRadius: '999px',
        fontSize: '12px',
        backgroundColor: palette.background,
        color: palette.color,
        fontWeight: 500,
      }}
    >
      {label}
    </span>
  );
}

function randomUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback para navegadores antiguos
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getIdempotencyKey(appointmentId: string): string {
  const key = localStorage.getItem(`telmed.payment.${appointmentId}`);
  if (key) {
    return key;
  }
  const newKey = randomUUID();
  localStorage.setItem(`telmed.payment.${appointmentId}`, newKey);
  return newKey;
}

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

function formatMoney(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

/**
 * Get date range for appointments list (default: next 30 days)
 */
function getDefaultDateRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now);
  from.setUTCHours(0, 0, 0, 0);

  const to = new Date(now);
  to.setUTCDate(to.getUTCDate() + 30);
  to.setUTCHours(23, 59, 59, 999);

  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

export function AppointmentsPage() {
  const navigate = useNavigate();
  const { getActiveToken, activeRole } = useAuth();

  const [appointments, setAppointments] = useState<Appointment[]>([]);
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

  const [dateRange, setDateRange] = useState(() => getDefaultDateRange());
  const [showDebug, setShowDebug] = useState(false);
  const [selectedEmergencyId, setSelectedEmergencyId] = useState<string | null>(
    null,
  );
  const [lastAppointmentsLoadedAt, setLastAppointmentsLoadedAt] = useState<
    string | null
  >(null);
  const [lastEmergenciesLoadedAt, setLastEmergenciesLoadedAt] = useState<
    string | null
  >(null);

  const [emergencies, setEmergencies] = useState<EmergencyItem[]>([]);
  const [emergenciesLoading, setEmergenciesLoading] = useState(false);
  const [emergenciesError, setEmergenciesError] =
    useState<ProblemDetails | null>(null);
  const [emergenciesPage, setEmergenciesPage] = useState(1);
  const [emergenciesPageInfo, setEmergenciesPageInfo] = useState<{
    page: number;
    pageSize: number;
    total: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  } | null>(null);

  // Cancel state
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [showCancelModal, setShowCancelModal] = useState<string | null>(null);

  // Payment state
  const [payingId, setPayingId] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<ProblemDetails | null>(null);
  const [quotingId, setQuotingId] = useState<string | null>(null);
  const [paymentQuote, setPaymentQuote] = useState<PaymentQuoteResponse | null>(
    null,
  );
  const [quoteError, setQuoteError] = useState<ProblemDetails | null>(null);
  const [confirmingQuote, setConfirmingQuote] = useState(false);

  // Emergency reject state
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null);

  const loadAppointments = useCallback(async () => {
    if (
      !getActiveToken() ||
      (activeRole !== 'patient' && activeRole !== 'doctor')
    ) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response: AppointmentsResponse =
        activeRole === 'patient'
          ? await listPatientAppointments(
              dateRange.from,
              dateRange.to,
              page,
              20,
            )
          : await listDoctorAppointments(
              dateRange.from,
              dateRange.to,
              page,
              20,
            );

      setAppointments(response.items);
      setPageInfo(response.pageInfo);
      setLastAppointmentsLoadedAt(new Date().toISOString());
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
          detail: 'Error al cargar turnos',
        });
      }
      setAppointments([]);
      setPageInfo(null);
      setLastAppointmentsLoadedAt(new Date().toISOString());
    } finally {
      setLoading(false);
    }
  }, [activeRole, dateRange.from, dateRange.to, getActiveToken, page]);

  const loadEmergencies = useCallback(async () => {
    if (
      !getActiveToken() ||
      (activeRole !== 'patient' && activeRole !== 'doctor')
    ) {
      return;
    }

    setEmergenciesLoading(true);
    setEmergenciesError(null);

    try {
      const response: EmergenciesResponse =
        activeRole === 'patient'
          ? await listPatientEmergencies({
              page: emergenciesPage,
              pageSize: 20,
            })
          : await listDoctorEmergencies({
              page: emergenciesPage,
              pageSize: 20,
            });

      setEmergencies(response.items);
      setEmergenciesPageInfo(response.pageInfo);
      setLastEmergenciesLoadedAt(new Date().toISOString());
    } catch (err) {
      const apiError = err as {
        problemDetails?: ProblemDetails;
        status?: number;
      };
      if (apiError.problemDetails) {
        setEmergenciesError(apiError.problemDetails);
      } else {
        setEmergenciesError({
          status: apiError.status || 500,
          detail: 'Error al cargar emergencias',
        });
      }
      setEmergencies([]);
      setEmergenciesPageInfo(null);
      setLastEmergenciesLoadedAt(new Date().toISOString());
    } finally {
      setEmergenciesLoading(false);
    }
  }, [activeRole, emergenciesPage, getActiveToken]);

  // Load appointments
  useEffect(() => {
    void loadAppointments();
  }, [loadAppointments]);

  // Load emergencies
  useEffect(() => {
    void loadEmergencies();
  }, [loadEmergencies]);

  useEffect(() => {
    const token = getActiveToken();
    if (!token || (activeRole !== 'patient' && activeRole !== 'doctor')) {
      notificationsSocket.disconnect();
      return;
    }

    notificationsSocket.connect(token);

    const handleAppointmentsChanged = () => {
      void loadAppointments();
    };
    const handleEmergenciesChanged = () => {
      void loadEmergencies();
    };

    notificationsSocket.onAppointmentsChanged(handleAppointmentsChanged);
    notificationsSocket.onEmergenciesChanged(handleEmergenciesChanged);
    notificationsSocket.onConsultationsChanged(handleEmergenciesChanged);

    return () => {
      notificationsSocket.offAppointmentsChanged(handleAppointmentsChanged);
      notificationsSocket.offEmergenciesChanged(handleEmergenciesChanged);
      notificationsSocket.offConsultationsChanged(handleEmergenciesChanged);
      notificationsSocket.disconnect();
    };
  }, [activeRole, getActiveToken, loadAppointments, loadEmergencies]);

  // Handle payment quote before checkout
  const handleQuote = async (input: PaymentQuoteRequest) => {
    if (!getActiveToken() || activeRole !== 'patient') {
      return;
    }

    const referenceId =
      input.kind === 'appointment' ? input.appointmentId : input.queueItemId;
    if (!referenceId) {
      return;
    }

    setQuotingId(referenceId);
    setQuoteError(null);
    setPaymentError(null);
    setEmergenciesError(null);
    setError(null);

    try {
      const quote = await getPaymentQuote(input);
      setPaymentQuote(quote);
    } catch (err) {
      const apiError = err as {
        problemDetails?: ProblemDetails;
        status?: number;
      };
      if (apiError.problemDetails) {
        setQuoteError(apiError.problemDetails);
        setError(apiError.problemDetails);
      } else {
        const errorDetails: ProblemDetails = {
          status: apiError.status || 500,
          detail: 'Error al obtener pre-pago',
        };
        setQuoteError(errorDetails);
        setError(errorDetails);
      }
    } finally {
      setQuotingId(null);
    }
  };

  const handleConfirmQuote = async () => {
    if (!paymentQuote || !getActiveToken() || activeRole !== 'patient') {
      return;
    }

    setConfirmingQuote(true);
    setQuoteError(null);

    if (paymentQuote.kind === 'appointment') {
      setPayingId(paymentQuote.referenceId);
      try {
        const idempotencyKey = getIdempotencyKey(paymentQuote.referenceId);
        const payment: PaymentCheckout = await payAppointment(
          paymentQuote.referenceId,
          idempotencyKey,
        );

        if (payment.checkoutUrl) {
          window.open(payment.checkoutUrl, '_blank', 'noopener,noreferrer');
        }
        setPaymentQuote(null);
      } catch (err) {
        const apiError = err as {
          problemDetails?: ProblemDetails;
          status?: number;
        };
        if (apiError.problemDetails) {
          setPaymentError(apiError.problemDetails);
          setQuoteError(apiError.problemDetails);
          setError(apiError.problemDetails);
        } else {
          const errorDetails: ProblemDetails = {
            status: apiError.status || 500,
            detail: 'Error al iniciar pago',
          };
          setPaymentError(errorDetails);
          setQuoteError(errorDetails);
          setError(errorDetails);
        }
      } finally {
        setPayingId(null);
        setConfirmingQuote(false);
      }
      return;
    }

    setEmergenciesLoading(true);
    try {
      const payment = await payForQueue(paymentQuote.referenceId);
      if (payment.checkoutUrl) {
        window.open(payment.checkoutUrl, '_blank', 'noopener,noreferrer');
      }
      await loadEmergencies();
      setPaymentQuote(null);
    } catch (err) {
      const apiError = err as {
        problemDetails?: ProblemDetails;
        status?: number;
      };
      const details = apiError.problemDetails || {
        status: apiError.status || 500,
        detail: 'Error al iniciar pago de emergencia',
      };
      setEmergenciesError(details);
      setQuoteError(details);
      setError(details);
    } finally {
      setEmergenciesLoading(false);
      setConfirmingQuote(false);
    }
  };

  const handleAcceptEmergency = async (queueItemId: string) => {
    if (!getActiveToken() || activeRole !== 'doctor') {
      return;
    }
    setEmergenciesLoading(true);
    setEmergenciesError(null);
    try {
      await acceptQueue(queueItemId);
      await loadEmergencies();
    } catch (err) {
      const apiError = err as {
        problemDetails?: ProblemDetails;
        status?: number;
      };
      setEmergenciesError(
        apiError.problemDetails || {
          status: apiError.status || 500,
          detail: 'Error al aceptar emergencia',
        },
      );
    } finally {
      setEmergenciesLoading(false);
    }
  };

  const handleQuoteAppointment = async (appointmentId: string) => {
    if (!getActiveToken() || activeRole !== 'patient') {
      return;
    }
    await handleQuote({ kind: 'appointment', appointmentId });
  };

  const handleQuoteEmergency = async (queueItemId: string) => {
    if (!getActiveToken() || activeRole !== 'patient') {
      return;
    }
    await handleQuote({ kind: 'emergency', queueItemId });
  };

  const handleRejectEmergency = async (queueItemId: string) => {
    if (!getActiveToken() || activeRole !== 'doctor') {
      return;
    }

    setRejectingId(queueItemId);
    setEmergenciesError(null);

    try {
      await rejectQueue(queueItemId, rejectReason || undefined);
      await loadEmergencies();
      setShowRejectModal(null);
      setRejectReason('');
    } catch (err) {
      const apiError = err as {
        problemDetails?: ProblemDetails;
        status?: number;
      };
      setEmergenciesError(
        apiError.problemDetails || {
          status: apiError.status || 500,
          detail: 'Error al rechazar emergencia',
        },
      );
    } finally {
      setRejectingId(null);
    }
  };

  const handleStartEmergency = async (queueItemId: string) => {
    if (!getActiveToken() || activeRole !== 'doctor') {
      return;
    }
    setEmergenciesLoading(true);
    setEmergenciesError(null);
    try {
      const result = await startQueue(queueItemId);
      navigate(`/room/${result.consultation.id}`);
    } catch (err) {
      const apiError = err as {
        problemDetails?: ProblemDetails;
        status?: number;
      };
      setEmergenciesError(
        apiError.problemDetails || {
          status: apiError.status || 500,
          detail: 'Error al iniciar emergencia',
        },
      );
    } finally {
      setEmergenciesLoading(false);
    }
  };

  // Handle cancel
  const handleCancel = async (appointmentId: string) => {
    if (!getActiveToken()) {
      return;
    }

    setCancellingId(appointmentId);
    setError(null);

    try {
      await cancelAppointment(appointmentId, cancelReason || undefined);
      // Refresh list
      const response =
        activeRole === 'patient'
          ? await listPatientAppointments(
              dateRange.from,
              dateRange.to,
              page,
              20,
            )
          : await listDoctorAppointments(
              dateRange.from,
              dateRange.to,
              page,
              20,
            );
      setAppointments(response.items);
      setPageInfo(response.pageInfo);
      setShowCancelModal(null);
      setCancelReason('');
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
          detail: 'Error al cancelar turno',
        });
      }
    } finally {
      setCancellingId(null);
    }
  };

  // Handle 401/403 -> redirect to login
  useEffect(() => {
    if (error && (error.status === 401 || error.status === 403)) {
      navigate('/login');
    }
  }, [error, navigate]);

  // Redirect if not patient or doctor
  useEffect(() => {
    if (activeRole && activeRole !== 'patient' && activeRole !== 'doctor') {
      navigate('/lobby');
    }
  }, [activeRole, navigate]);

  if (activeRole !== 'patient' && activeRole !== 'doctor') {
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
        <h1 style={{ margin: 0 }}>Mis Turnos</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => {
              void loadAppointments();
              void loadEmergencies();
            }}
            style={{
              padding: '8px 16px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Refrescar
          </button>
          <button
            onClick={() => setShowDebug((value) => !value)}
            style={{
              padding: '8px 16px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            {showDebug ? 'Ocultar debug' : 'Debug'}
          </button>
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
      </div>

      {/* Date Range Selector */}
      <div
        style={{
          marginBottom: '24px',
          padding: '16px',
          backgroundColor: '#f5f5f5',
          borderRadius: '4px',
        }}
      >
        <label
          style={{
            display: 'block',
            marginBottom: '8px',
            fontWeight: 'bold',
          }}
        >
          Rango de Fechas
        </label>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="date"
            value={isoToLocalDate(dateRange.from)}
            onChange={(e) => {
              const newDate = new Date(e.target.value + 'T00:00:00');
              setDateRange({
                from: newDate.toISOString(),
                to: dateRange.to,
              });
              setPage(1);
            }}
            style={{
              padding: '8px',
              border: '1px solid #ccc',
              borderRadius: '4px',
            }}
          />
          <span>hasta</span>
          <input
            type="date"
            value={isoToLocalDate(dateRange.to)}
            onChange={(e) => {
              const newDate = new Date(e.target.value + 'T23:59:59');
              setDateRange({
                from: dateRange.from,
                to: newDate.toISOString(),
              });
              setPage(1);
            }}
            style={{
              padding: '8px',
              border: '1px solid #ccc',
              borderRadius: '4px',
            }}
          />
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

      {emergenciesError && (
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
          <strong>Error {emergenciesError.status}:</strong>{' '}
          {emergenciesError.detail}
        </div>
      )}

      {showDebug && (
        <div
          style={{
            marginBottom: '16px',
            padding: '12px',
            backgroundColor: '#f8f9fa',
            border: '1px solid #dee2e6',
            borderRadius: '4px',
          }}
        >
          <strong>Debug panel</strong>
          <div style={{ marginTop: '8px', color: '#555' }}>
            <div>Ultima carga turnos: {lastAppointmentsLoadedAt ?? 'N/A'}</div>
            <div>
              Ultima carga emergencias: {lastEmergenciesLoadedAt ?? 'N/A'}
            </div>
            {error && (
              <div>
                Turnos error: {error.status} - {error.detail}
              </div>
            )}
            {emergenciesError && (
              <div>
                Emergencias error: {emergenciesError.status} -{' '}
                {emergenciesError.detail}
              </div>
            )}
          </div>
          {selectedEmergencyId && (
            <pre
              style={{
                marginTop: '12px',
                padding: '12px',
                backgroundColor: '#fff',
                border: '1px solid #eee',
                borderRadius: '4px',
                whiteSpace: 'pre-wrap',
              }}
            >
              {JSON.stringify(
                emergencies.find((item) => item.id === selectedEmergencyId) ??
                  null,
                null,
                2,
              )}
            </pre>
          )}
        </div>
      )}

      <div
        style={{
          marginBottom: '24px',
          padding: '16px',
          backgroundColor: '#f5f5f5',
          borderRadius: '4px',
        }}
      >
        <h2 style={{ marginTop: 0 }}>Emergencias</h2>
        {emergenciesLoading ? (
          <div style={{ textAlign: 'center', padding: '16px' }}>
            Cargando emergencias...
          </div>
        ) : emergencies.length === 0 ? (
          <div style={{ color: '#666' }}>No hay emergencias.</div>
        ) : (
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
          >
            {emergencies.map((emergency) => {
              // Helper functions for badges
              const getConsultationStatusBadge = () => {
                if (!emergency.consultation) {
                  return <Badge label="Consulta no iniciada" tone="neutral" />;
                }
                if (emergency.consultation.status === 'in_progress') {
                  return <Badge label="En curso" tone="info" />;
                }
                if (emergency.consultation.status === 'closed') {
                  return <Badge label="Finalizada" tone="success" />;
                }
                return <Badge label="Borrador" tone="neutral" />;
              };

              const getQueueStatusBadge = () => {
                const statusMap: Record<
                  string,
                  {
                    label: string;
                    tone: 'success' | 'warning' | 'error' | 'info' | 'neutral';
                  }
                > = {
                  queued: { label: 'En cola', tone: 'warning' },
                  accepted: { label: 'Aceptada', tone: 'info' },
                  rejected: { label: 'Rechazada', tone: 'error' },
                  cancelled: { label: 'Cancelada', tone: 'error' },
                  expired: { label: 'Expirada', tone: 'error' },
                };
                const mapped = statusMap[emergency.queueStatus] || {
                  label: emergency.queueStatus,
                  tone: 'neutral' as const,
                };
                return <Badge label={mapped.label} tone={mapped.tone} />;
              };

              const getPaymentStatusBadge = () => {
                const statusMap: Record<
                  string,
                  {
                    label: string;
                    tone: 'success' | 'warning' | 'error' | 'info' | 'neutral';
                  }
                > = {
                  not_started: { label: 'Pago: no iniciado', tone: 'neutral' },
                  pending: { label: 'Pago: pendiente', tone: 'warning' },
                  paid: { label: 'Pago: OK', tone: 'success' },
                  expired: { label: 'Pago: expirado', tone: 'error' },
                  failed: { label: 'Pago: fallido', tone: 'error' },
                };
                const mapped = statusMap[emergency.paymentStatus] || {
                  label: `Pago: ${emergency.paymentStatus}`,
                  tone: 'neutral' as const,
                };
                return <Badge label={mapped.label} tone={mapped.tone} />;
              };

              return (
                <div
                  key={emergency.id}
                  onClick={() => setSelectedEmergencyId(emergency.id)}
                  style={{
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    padding: '12px',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: '8px',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ marginBottom: '6px' }}>
                        <strong>Fecha:</strong>{' '}
                        {formatDateTime(emergency.createdAt)}
                      </div>
                      <div style={{ marginBottom: '6px' }}>
                        <strong>
                          {activeRole === 'doctor' ? 'Paciente' : 'Doctor'}:
                        </strong>{' '}
                        {emergency.counterparty?.displayName || 'Usuario'}
                      </div>
                      {emergency.reason && (
                        <div style={{ marginBottom: '6px' }}>
                          <strong>Motivo:</strong> {emergency.reason}
                        </div>
                      )}
                      {emergency.specialty && (
                        <div style={{ marginBottom: '6px', color: '#666' }}>
                          <strong>Especialidad:</strong> {emergency.specialty}
                        </div>
                      )}
                      {emergency.priceCents !== null &&
                        emergency.priceCents !== undefined && (
                          <div style={{ marginBottom: '6px' }}>
                            <strong>Precio:</strong>{' '}
                            {(emergency.priceCents / 100).toFixed(2)}
                          </div>
                        )}
                      {emergency.consultation?.startedAt && (
                        <div
                          style={{
                            marginBottom: '6px',
                            fontSize: '13px',
                            color: '#666',
                          }}
                        >
                          <strong>Iniciada:</strong>{' '}
                          {formatDateTime(emergency.consultation.startedAt)}
                        </div>
                      )}
                      {emergency.consultation?.closedAt && (
                        <div
                          style={{
                            marginBottom: '6px',
                            fontSize: '13px',
                            color: '#666',
                          }}
                        >
                          <strong>Cerrada:</strong>{' '}
                          {formatDateTime(emergency.consultation.closedAt)}
                        </div>
                      )}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        alignItems: 'flex-end',
                      }}
                    >
                      {getConsultationStatusBadge()}
                      {getQueueStatusBadge()}
                      {getPaymentStatusBadge()}
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: '8px',
                      flexWrap: 'wrap',
                      marginTop: '8px',
                    }}
                  >
                    {activeRole === 'doctor' &&
                      emergency.queueStatus === 'queued' && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleAcceptEmergency(emergency.id);
                            }}
                            style={{
                              padding: '8px 16px',
                              backgroundColor: '#28a745',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                            }}
                          >
                            Aceptar
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowRejectModal(emergency.id);
                            }}
                            style={{
                              padding: '8px 16px',
                              backgroundColor: '#dc3545',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                            }}
                          >
                            Rechazar
                          </button>
                        </>
                      )}
                    {activeRole === 'doctor' && emergency.canStart && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleStartEmergency(emergency.id);
                        }}
                        style={{
                          padding: '8px 16px',
                          backgroundColor: '#007bff',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                        }}
                      >
                        Start
                      </button>
                    )}
                    {emergency.consultation?.status === 'in_progress' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/room/${emergency.consultation!.id}`);
                        }}
                        style={{
                          padding: '8px 16px',
                          backgroundColor: '#28a745',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                        }}
                      >
                        Entrar a consulta
                      </button>
                    )}
                    {activeRole === 'patient' &&
                      emergency.paymentStatus === 'pending' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleQuoteEmergency(emergency.id);
                          }}
                          disabled={
                            quotingId === emergency.id || confirmingQuote
                          }
                          style={{
                            padding: '8px 16px',
                            backgroundColor: '#007bff',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor:
                              quotingId === emergency.id
                                ? 'not-allowed'
                                : 'pointer',
                          }}
                        >
                          {quotingId === emergency.id
                            ? 'Calculando...'
                            : 'Pagar'}
                        </button>
                      )}
                  </div>
                  {activeRole === 'doctor' &&
                    showRejectModal === emergency.id && (
                      <div
                        style={{
                          marginTop: '12px',
                          padding: '12px',
                          backgroundColor: '#f5f5f5',
                          borderRadius: '4px',
                        }}
                      >
                        <label
                          style={{
                            display: 'block',
                            marginBottom: '8px',
                            fontWeight: 'bold',
                          }}
                        >
                          Motivo de rechazo (opcional):
                        </label>
                        <textarea
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="Ej: No disponible"
                          style={{
                            width: '100%',
                            padding: '8px',
                            border: '1px solid #ccc',
                            borderRadius: '4px',
                            marginBottom: '8px',
                          }}
                        />
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleRejectEmergency(emergency.id);
                            }}
                            disabled={rejectingId === emergency.id}
                            style={{
                              padding: '8px 16px',
                              backgroundColor: '#dc3545',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor:
                                rejectingId === emergency.id
                                  ? 'not-allowed'
                                  : 'pointer',
                            }}
                          >
                            {rejectingId === emergency.id
                              ? 'Rechazando...'
                              : 'Confirmar Rechazo'}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowRejectModal(null);
                              setRejectReason('');
                            }}
                            disabled={rejectingId === emergency.id}
                            style={{
                              padding: '8px 16px',
                              backgroundColor: '#6c757d',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor:
                                rejectingId === emergency.id
                                  ? 'not-allowed'
                                  : 'pointer',
                            }}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                </div>
              );
            })}
          </div>
        )}

        {emergenciesPageInfo && emergenciesPageInfo.total > 0 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '12px',
            }}
          >
            <button
              onClick={() => setEmergenciesPage(emergenciesPage - 1)}
              disabled={!emergenciesPageInfo.hasPrevPage}
              style={{
                padding: '6px 12px',
                backgroundColor: emergenciesPageInfo.hasPrevPage
                  ? '#6c757d'
                  : '#ccc',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: emergenciesPageInfo.hasPrevPage
                  ? 'pointer'
                  : 'not-allowed',
              }}
            >
              Anterior
            </button>
            <span>Página {emergenciesPageInfo.page}</span>
            <button
              onClick={() => setEmergenciesPage(emergenciesPage + 1)}
              disabled={!emergenciesPageInfo.hasNextPage}
              style={{
                padding: '6px 12px',
                backgroundColor: emergenciesPageInfo.hasNextPage
                  ? '#007bff'
                  : '#ccc',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: emergenciesPageInfo.hasNextPage
                  ? 'pointer'
                  : 'not-allowed',
              }}
            >
              Siguiente
            </button>
          </div>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '24px' }}>Cargando...</div>
      )}

      {/* Empty state */}
      {!loading && appointments.length === 0 && !error && (
        <div
          style={{
            textAlign: 'center',
            padding: '48px',
            color: '#666',
          }}
        >
          {activeRole === 'patient'
            ? 'No tienes turnos en este rango de fechas.'
            : 'No tenés turnos en este rango de fechas.'}
        </div>
      )}

      {/* Appointments List */}
      {!loading && appointments.length > 0 && (
        <>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              marginBottom: '24px',
            }}
          >
            {appointments.map((appointment) => {
              const isPaymentPending =
                appointment.status === 'pending_payment' &&
                appointment.paymentExpiresAt &&
                new Date(appointment.paymentExpiresAt) > new Date();
              const isPaymentExpired =
                appointment.status === 'pending_payment' &&
                appointment.paymentExpiresAt &&
                new Date(appointment.paymentExpiresAt) <= new Date();

              // Helper functions for badges
              const getConsultationStatusBadge = () => {
                if (!appointment.consultation) {
                  return <Badge label="Consulta no iniciada" tone="neutral" />;
                }
                if (appointment.consultation.status === 'in_progress') {
                  return <Badge label="En curso" tone="info" />;
                }
                if (appointment.consultation.status === 'closed') {
                  return <Badge label="Finalizada" tone="success" />;
                }
                return <Badge label="Borrador" tone="neutral" />;
              };

              const getAppointmentStatusBadge = () => {
                const statusMap: Record<
                  string,
                  {
                    label: string;
                    tone: 'success' | 'warning' | 'error' | 'info' | 'neutral';
                  }
                > = {
                  pending_payment: {
                    label: 'Pendiente de pago',
                    tone: 'warning',
                  },
                  scheduled: { label: 'Programado', tone: 'info' },
                  cancelled: { label: 'Cancelado', tone: 'error' },
                };
                const mapped = statusMap[appointment.status] || {
                  label: appointment.status,
                  tone: 'neutral' as const,
                };
                return <Badge label={mapped.label} tone={mapped.tone} />;
              };

              return (
                <div
                  key={appointment.id}
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
                      alignItems: 'flex-start',
                      marginBottom: '8px',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ marginBottom: '8px' }}>
                        <strong>Fecha:</strong>{' '}
                        {formatDateTime(appointment.startAt)}
                      </div>
                      {activeRole === 'doctor' && (
                        <div style={{ marginBottom: '8px', color: '#666' }}>
                          <strong>Paciente ID:</strong>{' '}
                          {appointment.patientUserId}
                        </div>
                      )}
                      {appointment.consultation?.startedAt && (
                        <div
                          style={{
                            marginBottom: '8px',
                            fontSize: '13px',
                            color: '#666',
                          }}
                        >
                          <strong>Iniciada:</strong>{' '}
                          {formatDateTime(appointment.consultation.startedAt)}
                        </div>
                      )}
                      {appointment.consultation?.closedAt && (
                        <div
                          style={{
                            marginBottom: '8px',
                            fontSize: '13px',
                            color: '#666',
                          }}
                        >
                          <strong>Cerrada:</strong>{' '}
                          {formatDateTime(appointment.consultation.closedAt)}
                        </div>
                      )}
                      {appointment.cancelledAt && (
                        <div
                          style={{
                            marginBottom: '8px',
                            fontSize: '13px',
                            color: '#666',
                          }}
                        >
                          <strong>Cancelado:</strong>{' '}
                          {formatDateTime(appointment.cancelledAt)}
                          {appointment.cancellationReason && (
                            <span> - {appointment.cancellationReason}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        alignItems: 'flex-end',
                      }}
                    >
                      {getConsultationStatusBadge()}
                      {getAppointmentStatusBadge()}
                    </div>
                  </div>
                  {isPaymentPending && activeRole === 'patient' && (
                    <div
                      style={{
                        marginBottom: '8px',
                        padding: '8px',
                        backgroundColor: '#fff3cd',
                        border: '1px solid #ffc107',
                        borderRadius: '4px',
                        color: '#856404',
                      }}
                    >
                      <strong>⚠️ Pago pendiente</strong>
                      {appointment.paymentExpiresAt && (
                        <div style={{ fontSize: '14px', marginTop: '4px' }}>
                          Vence:{' '}
                          {new Date(
                            appointment.paymentExpiresAt,
                          ).toLocaleString('es-AR')}
                        </div>
                      )}
                      <div style={{ fontSize: '14px', marginTop: '4px' }}>
                        El pago debe completarse para confirmar el turno. Si ya
                        realizaste el pago, el estado se actualizará
                        automáticamente.
                      </div>
                      {paymentError &&
                        paymentError.status === 409 &&
                        appointment.id === payingId && (
                          <div
                            style={{
                              marginTop: '8px',
                              padding: '8px',
                              backgroundColor: '#f8d7da',
                              border: '1px solid #f5c6cb',
                              borderRadius: '4px',
                              color: '#721c24',
                              fontSize: '14px',
                            }}
                          >
                            {paymentError.detail ||
                              'El turno ya no es pagable o ya está pagado'}
                          </div>
                        )}
                    </div>
                  )}
                  {isPaymentExpired && activeRole === 'patient' && (
                    <div
                      style={{
                        marginBottom: '8px',
                        padding: '8px',
                        backgroundColor: '#f8d7da',
                        border: '1px solid #f5c6cb',
                        borderRadius: '4px',
                        color: '#721c24',
                      }}
                    >
                      <strong>❌ Pago expirado</strong>
                      <div style={{ fontSize: '14px', marginTop: '4px' }}>
                        El tiempo para realizar el pago ha expirado. El turno
                        será cancelado automáticamente.
                      </div>
                    </div>
                  )}
                  {appointment.cancelledAt && (
                    <div style={{ marginBottom: '8px', color: '#666' }}>
                      Cancelado: {formatDateTime(appointment.cancelledAt)}
                      {appointment.cancellationReason && (
                        <span> - {appointment.cancellationReason}</span>
                      )}
                    </div>
                  )}
                  {appointment.status !== 'cancelled' && (
                    <div
                      style={{
                        display: 'flex',
                        gap: '8px',
                        marginTop: '8px',
                        flexWrap: 'wrap',
                      }}
                    >
                      {appointment.consultation?.status === 'in_progress' && (
                        <button
                          onClick={() =>
                            navigate(`/room/${appointment.consultation!.id}`)
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
                          Entrar a consulta
                        </button>
                      )}
                      {isPaymentPending &&
                        activeRole === 'patient' &&
                        !isPaymentExpired && (
                          <button
                            onClick={() =>
                              void handleQuoteAppointment(appointment.id)
                            }
                            disabled={
                              payingId === appointment.id ||
                              quotingId === appointment.id ||
                              confirmingQuote
                            }
                            style={{
                              padding: '8px 16px',
                              backgroundColor:
                                payingId === appointment.id ||
                                quotingId === appointment.id
                                  ? '#ccc'
                                  : '#28a745',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor:
                                payingId === appointment.id ||
                                quotingId === appointment.id
                                  ? 'not-allowed'
                                  : 'pointer',
                            }}
                          >
                            {quotingId === appointment.id
                              ? 'Calculando...'
                              : payingId === appointment.id
                                ? 'Abriendo pago...'
                                : 'Pagar'}
                          </button>
                        )}
                      <button
                        onClick={() => setShowCancelModal(appointment.id)}
                        disabled={cancellingId === appointment.id}
                        style={{
                          padding: '8px 16px',
                          backgroundColor: '#dc3545',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor:
                            cancellingId === appointment.id
                              ? 'not-allowed'
                              : 'pointer',
                        }}
                      >
                        {cancellingId === appointment.id
                          ? 'Cancelando...'
                          : 'Cancelar'}
                      </button>
                    </div>
                  )}

                  {/* Cancel Modal */}
                  {showCancelModal === appointment.id && (
                    <div
                      style={{
                        marginTop: '12px',
                        padding: '12px',
                        backgroundColor: '#f5f5f5',
                        borderRadius: '4px',
                      }}
                    >
                      <label
                        style={{
                          display: 'block',
                          marginBottom: '8px',
                          fontWeight: 'bold',
                        }}
                      >
                        Motivo de cancelación (opcional):
                      </label>
                      <textarea
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                        placeholder="Ej: Cambio de planes"
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: '1px solid #ccc',
                          borderRadius: '4px',
                          marginBottom: '8px',
                        }}
                      />
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => void handleCancel(appointment.id)}
                          disabled={cancellingId === appointment.id}
                          style={{
                            padding: '8px 16px',
                            backgroundColor: '#dc3545',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor:
                              cancellingId === appointment.id
                                ? 'not-allowed'
                                : 'pointer',
                          }}
                        >
                          {cancellingId === appointment.id
                            ? 'Cancelando...'
                            : 'Confirmar Cancelación'}
                        </button>
                        <button
                          onClick={() => {
                            setShowCancelModal(null);
                            setCancelReason('');
                          }}
                          disabled={cancellingId === appointment.id}
                          style={{
                            padding: '8px 16px',
                            backgroundColor: '#6c757d',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor:
                              cancellingId === appointment.id
                                ? 'not-allowed'
                                : 'pointer',
                          }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
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

      {paymentQuote && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '16px',
            zIndex: 50,
          }}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: '16px',
              width: 'min(420px, 100%)',
              boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
            }}
          >
            <h3 style={{ marginTop: 0 }}>Resumen de pago</h3>
            {paymentQuote.doctorDisplayName && (
              <div style={{ marginBottom: '8px' }}>
                <strong>Doctor:</strong> {paymentQuote.doctorDisplayName}
              </div>
            )}
            <div style={{ marginBottom: '6px' }}>
              <strong>Consulta:</strong>{' '}
              {formatMoney(paymentQuote.grossCents, paymentQuote.currency)}
            </div>
            <div style={{ marginBottom: '6px' }}>
              <strong>Comisión TelMed (15%):</strong>{' '}
              {formatMoney(
                paymentQuote.platformFeeCents,
                paymentQuote.currency,
              )}
            </div>
            <div style={{ marginBottom: '12px' }}>
              <strong>Total a pagar:</strong>{' '}
              {formatMoney(
                paymentQuote.totalChargedCents,
                paymentQuote.currency,
              )}
            </div>
            {quoteError && (
              <div
                style={{
                  marginBottom: '12px',
                  color: '#991b1b',
                  backgroundColor: '#fee2e2',
                  padding: '8px',
                  borderRadius: '4px',
                }}
              >
                {quoteError.detail || 'Error al obtener pre-pago'}
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => void handleConfirmQuote()}
                disabled={confirmingQuote}
                style={{
                  padding: '8px 16px',
                  backgroundColor: confirmingQuote ? '#ccc' : '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: confirmingQuote ? 'not-allowed' : 'pointer',
                }}
              >
                {confirmingQuote ? 'Procesando...' : 'Continuar'}
              </button>
              <button
                onClick={() => {
                  setPaymentQuote(null);
                  setQuoteError(null);
                }}
                disabled={confirmingQuote}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: confirmingQuote ? 'not-allowed' : 'pointer',
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Helper: Convert ISO UTC date to local date string (YYYY-MM-DD)
 */
function isoToLocalDate(iso: string): string {
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
