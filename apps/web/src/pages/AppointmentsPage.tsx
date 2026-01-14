import { useState, useEffect } from 'react';
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
import { type ProblemDetails } from '../api/http';

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

  // Cancel state
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [showCancelModal, setShowCancelModal] = useState<string | null>(null);

  // Payment state
  const [payingId, setPayingId] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<ProblemDetails | null>(null);

  // Load appointments
  useEffect(() => {
    const loadAppointments = async () => {
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
      } finally {
        setLoading(false);
      }
    };

    void loadAppointments();
  }, [dateRange.from, dateRange.to, page, getActiveToken, activeRole]);

  // Handle payment
  const handlePay = async (appointmentId: string) => {
    if (!getActiveToken() || activeRole !== 'patient') {
      return;
    }

    setPayingId(appointmentId);
    setPaymentError(null);
    setError(null);

    try {
      const idempotencyKey = getIdempotencyKey(appointmentId);
      const payment: PaymentCheckout = await payAppointment(
        appointmentId,
        idempotencyKey,
      );

      // Open checkout URL in new tab
      if (payment.checkoutUrl) {
        window.open(payment.checkoutUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      const apiError = err as {
        problemDetails?: ProblemDetails;
        status?: number;
      };
      if (apiError.problemDetails) {
        setPaymentError(apiError.problemDetails);
        // Also set general error for visibility
        setError(apiError.problemDetails);
      } else {
        const errorDetails: ProblemDetails = {
          status: apiError.status || 500,
          detail: 'Error al iniciar pago',
        };
        setPaymentError(errorDetails);
        setError(errorDetails);
      }
    } finally {
      setPayingId(null);
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
                  <div style={{ marginBottom: '8px' }}>
                    <strong>Fecha:</strong>{' '}
                    {formatDateTime(appointment.startAt)}
                  </div>
                  {activeRole === 'doctor' && (
                    <div style={{ marginBottom: '8px', color: '#666' }}>
                      <strong>Paciente ID:</strong> {appointment.patientUserId}
                    </div>
                  )}
                  <div style={{ marginBottom: '8px' }}>
                    <strong>Estado:</strong>{' '}
                    {appointment.status === 'pending_payment'
                      ? 'Pendiente de pago'
                      : appointment.status === 'scheduled'
                        ? 'Programado'
                        : appointment.status === 'cancelled'
                          ? 'Cancelado'
                          : appointment.status}
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
                      style={{ display: 'flex', gap: '8px', marginTop: '8px' }}
                    >
                      {isPaymentPending &&
                        activeRole === 'patient' &&
                        !isPaymentExpired && (
                          <button
                            onClick={() => void handlePay(appointment.id)}
                            disabled={
                              payingId === appointment.id ||
                              (payingId !== null && payingId !== appointment.id)
                            }
                            style={{
                              padding: '8px 16px',
                              backgroundColor:
                                payingId === appointment.id
                                  ? '#ccc'
                                  : '#28a745',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor:
                                payingId === appointment.id
                                  ? 'not-allowed'
                                  : 'pointer',
                            }}
                          >
                            {payingId === appointment.id
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
