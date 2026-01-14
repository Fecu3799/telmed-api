import { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  getDoctorAvailability,
  createAppointment,
  type AvailabilitySlot,
  type AvailabilityResponse,
  type AppointmentWithPayment,
} from '../api/appointments';
import { type DoctorSearchItem } from '../api/doctor-search';
import { type ProblemDetails } from '../api/http';
import { PatientIdentityModal } from '../components/PatientIdentityModal';

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

/**
 * Helper: Get start of day in UTC ISO for a given date (YYYY-MM-DD)
 */
function getStartOfDayUTC(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toISOString();
}

/**
 * Helper: Get end of day in UTC ISO for a given date (YYYY-MM-DD)
 * Returns start of next day
 */
function getEndOfDayUTC(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

/**
 * Helper: Format ISO UTC time to local time string (HH:MM)
 */
function formatTimeLocal(iso: string): string {
  const date = new Date(iso);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Helper: Check if a date (YYYY-MM-DD) is within leadTime (24h) and horizon (60d)
 */
function isDateValid(
  dateStr: string,
  leadTimeHours = 24,
  horizonDays = 60,
): {
  valid: boolean;
  reason?: string;
} {
  const selectedDate = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  const minDate = new Date(now);
  minDate.setHours(minDate.getHours() + leadTimeHours);
  const maxDate = new Date(now);
  maxDate.setDate(maxDate.getDate() + horizonDays);

  if (selectedDate < minDate) {
    return {
      valid: false,
      reason: `La fecha debe ser al menos ${leadTimeHours} horas en el futuro`,
    };
  }
  if (selectedDate > maxDate) {
    return {
      valid: false,
      reason: `La fecha no puede ser más de ${horizonDays} días en el futuro`,
    };
  }
  return { valid: true };
}

/**
 * Get minimum selectable date (today + leadTime)
 */
function getMinDate(leadTimeHours = 24): string {
  const date = new Date();
  date.setHours(date.getHours() + leadTimeHours);
  return isoToLocalDate(date.toISOString());
}

/**
 * Get maximum selectable date (today + horizon)
 */
function getMaxDate(horizonDays = 60): string {
  const date = new Date();
  date.setDate(date.getDate() + horizonDays);
  return isoToLocalDate(date.toISOString());
}

export function DoctorProfilePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { doctorUserId } = useParams<{ doctorUserId: string }>();
  const { getActiveToken, activeRole } = useAuth();

  // Doctor info (passed via navigation state)
  const [doctorInfo, setDoctorInfo] = useState<DoctorSearchItem | null>(
    (location.state as { doctor?: DoctorSearchItem })?.doctor || null,
  );

  // Availability state
  const [dateFrom, setDateFrom] = useState<string>(() => {
    // Default: today + 2 days (to avoid leadTime)
    const date = new Date();
    date.setDate(date.getDate() + 2);
    return date.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState<string>(() => {
    // Default: from + 14 days
    const date = new Date();
    date.setDate(date.getDate() + 2 + 14);
    return date.toISOString().split('T')[0];
  });
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [availabilityError, setAvailabilityError] =
    useState<ProblemDetails | null>(null);
  const [availabilityMeta, setAvailabilityMeta] = useState<{
    leadTimeHours: number;
    horizonDays: number;
  } | null>(null);

  // Booking state
  const [bookingSlot, setBookingSlot] = useState<string | null>(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState<ProblemDetails | null>(null);
  const [bookingSuccess, setBookingSuccess] =
    useState<AppointmentWithPayment | null>(null);

  // Patient identity modal
  const [showIdentityModal, setShowIdentityModal] = useState(false);

  // Load doctor info from location state (if navigated from search)
  useEffect(() => {
    // Try to get doctor info from navigation state
    // If not available, we could fetch it, but for now we'll rely on navigation state
    // The user should navigate from DoctorSearchPage with state
  }, []);

  // Load availability function (called manually via button)
  const loadAvailability = async () => {
    if (!dateFrom || !dateTo || !doctorUserId) {
      setSlots([]);
      return;
    }

    // Validate date range
    if (dateFrom >= dateTo) {
      setAvailabilityError({
        status: 422,
        detail: 'La fecha de inicio debe ser anterior a la fecha de fin',
      });
      setSlots([]);
      return;
    }

    // Validate date range against horizon (soft validation)
    const fromDate = new Date(dateFrom + 'T00:00:00');
    const toDate = new Date(dateTo + 'T00:00:00');
    const now = new Date();
    const maxDate = new Date(now);
    maxDate.setDate(maxDate.getDate() + 60); // horizon = 60d

    if (toDate > maxDate) {
      setAvailabilityError({
        status: 422,
        detail: 'El rango no puede exceder 60 días desde hoy',
      });
      setSlots([]);
      return;
    }

    if (!getActiveToken()) {
      return;
    }

    setLoadingAvailability(true);
    setAvailabilityError(null);

    try {
      const from = getStartOfDayUTC(dateFrom);
      const to = getEndOfDayUTC(dateTo);

      const response: AvailabilityResponse = await getDoctorAvailability(
        doctorUserId,
        from,
        to,
      );

      setSlots(response.items);
      setAvailabilityMeta({
        leadTimeHours: response.meta.leadTimeHours,
        horizonDays: response.meta.horizonDays,
      });
    } catch (err) {
      const apiError = err as {
        problemDetails?: ProblemDetails;
        status?: number;
      };
      if (apiError.problemDetails) {
        setAvailabilityError(apiError.problemDetails);
      } else {
        setAvailabilityError({
          status: apiError.status || 500,
          detail: 'Error al cargar disponibilidad',
        });
      }
      setSlots([]);
    } finally {
      setLoadingAvailability(false);
    }
  };

  // Handle slot booking
  const handleBookSlot = async (slotStartAt: string) => {
    if (!doctorUserId || !getActiveToken()) {
      return;
    }

    setBookingSlot(slotStartAt);
    setBookingLoading(true);
    setBookingError(null);
    setBookingSuccess(null);

    try {
      const response = await createAppointment({
        doctorUserId,
        startAt: slotStartAt,
      });

      setBookingSuccess(response);
      // Refresh availability to remove booked slot
      if (dateFrom && dateTo) {
        const from = getStartOfDayUTC(dateFrom);
        const to = getEndOfDayUTC(dateTo);
        const updatedResponse = await getDoctorAvailability(
          doctorUserId,
          from,
          to,
        );
        setSlots(updatedResponse.items);
      }
    } catch (err) {
      const apiError = err as {
        problemDetails?: ProblemDetails;
        status?: number;
      };

      if (apiError.problemDetails) {
        setBookingError(apiError.problemDetails);

        // Check if it's a PatientProfile error (409 Conflict with "Patient identity is incomplete")
        if (
          apiError.problemDetails.status === 409 &&
          apiError.problemDetails.detail?.toLowerCase().includes('identity')
        ) {
          setShowIdentityModal(true);
        }
      } else {
        setBookingError({
          status: apiError.status || 500,
          detail: 'Error al reservar turno',
        });
      }
    } finally {
      setBookingLoading(false);
    }
  };

  // Handle 401/403 -> redirect to login
  useEffect(() => {
    if (
      availabilityError &&
      (availabilityError.status === 401 || availabilityError.status === 403)
    ) {
      navigate('/login');
    }
    if (
      bookingError &&
      (bookingError.status === 401 || bookingError.status === 403)
    ) {
      navigate('/login');
    }
  }, [availabilityError, bookingError, navigate]);

  // If no doctor info from state, redirect back to search
  useEffect(() => {
    if (!doctorInfo && doctorUserId) {
      // Could fetch doctor details here, but for now redirect if no state
      navigate('/doctor-search');
    }
  }, [doctorInfo, doctorUserId, navigate]);

  const displayName =
    doctorInfo?.displayName ||
    (doctorInfo?.firstName && doctorInfo?.lastName
      ? `${doctorInfo.firstName} ${doctorInfo.lastName}`
      : doctorInfo?.firstName || doctorInfo?.lastName || 'Doctor');

  const priceDisplay = doctorInfo
    ? new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: doctorInfo.currency || 'ARS',
      }).format(doctorInfo.priceCents / 100)
    : '';

  // Calculate min/max dates for date inputs
  const minDate = availabilityMeta
    ? getMinDate(availabilityMeta.leadTimeHours)
    : getMinDate();
  const maxDate = availabilityMeta
    ? getMaxDate(availabilityMeta.horizonDays)
    : getMaxDate();

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
        <h1 style={{ margin: 0 }}>Perfil del Médico</h1>
        <button
          onClick={() => navigate('/doctor-search')}
          style={{
            padding: '8px 16px',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Volver a Búsqueda
        </button>
      </div>

      {/* Doctor Info */}
      {doctorInfo && (
        <div
          style={{
            marginBottom: '24px',
            padding: '16px',
            backgroundColor: '#f5f5f5',
            borderRadius: '4px',
          }}
        >
          <h2 style={{ marginTop: 0 }}>{displayName}</h2>
          {doctorInfo.specialties && doctorInfo.specialties.length > 0 && (
            <div style={{ marginBottom: '8px', color: '#666' }}>
              {doctorInfo.specialties.map((s) => s.name).join(', ')}
            </div>
          )}
          <div style={{ marginBottom: '8px' }}>
            <strong>Precio:</strong> {priceDisplay}
          </div>
          {doctorInfo.distanceMeters !== null &&
            doctorInfo.distanceMeters !== undefined && (
              <div style={{ marginBottom: '8px', color: '#666' }}>
                Distancia: {(doctorInfo.distanceMeters / 1000).toFixed(2)} km
              </div>
            )}
        </div>
      )}

      {/* Availability Section */}
      <div
        style={{
          marginBottom: '24px',
          padding: '16px',
          backgroundColor: 'white',
          border: '1px solid #ddd',
          borderRadius: '4px',
        }}
      >
        <h2 style={{ marginTop: 0 }}>Disponibilidad</h2>

        <div style={{ marginBottom: '16px' }}>
          <div
            style={{
              display: 'flex',
              gap: '16px',
              alignItems: 'flex-end',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: '1', minWidth: '150px' }}>
              <label
                style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontWeight: 'bold',
                }}
              >
                Desde
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setSlots([]);
                  setAvailabilityError(null);
                }}
                min={minDate}
                max={maxDate}
                style={{
                  padding: '8px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  width: '100%',
                }}
              />
            </div>
            <div style={{ flex: '1', minWidth: '150px' }}>
              <label
                style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontWeight: 'bold',
                }}
              >
                Hasta
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setSlots([]);
                  setAvailabilityError(null);
                }}
                min={minDate}
                max={maxDate}
                style={{
                  padding: '8px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  width: '100%',
                }}
              />
            </div>
            <div>
              <button
                onClick={() => void loadAvailability()}
                disabled={loadingAvailability || !dateFrom || !dateTo}
                style={{
                  padding: '10px 20px',
                  backgroundColor:
                    loadingAvailability || !dateFrom || !dateTo
                      ? '#ccc'
                      : '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor:
                    loadingAvailability || !dateFrom || !dateTo
                      ? 'not-allowed'
                      : 'pointer',
                  fontSize: '16px',
                }}
              >
                {loadingAvailability ? 'Buscando...' : 'Buscar Turnos'}
              </button>
            </div>
          </div>
          {availabilityMeta && (
            <div style={{ marginTop: '8px', fontSize: '14px', color: '#666' }}>
              Puedes reservar desde {minDate} hasta {maxDate}
            </div>
          )}
        </div>

        {/* Availability Error */}
        {availabilityError &&
          availabilityError.status !== 401 &&
          availabilityError.status !== 403 && (
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
              <strong>Error {availabilityError.status}:</strong>{' '}
              {availabilityError.detail}
              {availabilityError.errors && (
                <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                  {Object.entries(availabilityError.errors).map(
                    ([field, messages]) => (
                      <li key={field}>
                        <strong>{field}:</strong> {messages.join(', ')}
                      </li>
                    ),
                  )}
                </ul>
              )}
            </div>
          )}

        {/* Loading Availability */}
        {loadingAvailability && (
          <div style={{ textAlign: 'center', padding: '24px' }}>
            Cargando disponibilidad...
          </div>
        )}

        {/* Empty Slots */}
        {!loadingAvailability &&
          dateFrom &&
          dateTo &&
          slots.length === 0 &&
          !availabilityError && (
            <div
              style={{
                textAlign: 'center',
                padding: '24px',
                color: '#666',
              }}
            >
              Sin disponibilidad para este rango de fechas
            </div>
          )}

        {/* Slots List */}
        {!loadingAvailability && slots.length > 0 && (
          <div>
            <h3 style={{ marginTop: 0, marginBottom: '12px' }}>
              Horarios Disponibles
            </h3>
            {/* Group slots by date */}
            {(() => {
              const slotsByDate = new Map<string, AvailabilitySlot[]>();
              for (const slot of slots) {
                const dateKey = isoToLocalDate(slot.startAt);
                if (!slotsByDate.has(dateKey)) {
                  slotsByDate.set(dateKey, []);
                }
                slotsByDate.get(dateKey)!.push(slot);
              }

              return Array.from(slotsByDate.entries()).map(
                ([date, dateSlots]) => (
                  <div key={date} style={{ marginBottom: '24px' }}>
                    <h4 style={{ marginBottom: '8px', color: '#666' }}>
                      {new Date(date + 'T00:00:00').toLocaleDateString(
                        'es-AR',
                        {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        },
                      )}
                    </h4>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns:
                          'repeat(auto-fill, minmax(120px, 1fr))',
                        gap: '8px',
                      }}
                    >
                      {dateSlots.map((slot) => {
                        const isBooking =
                          bookingSlot === slot.startAt && bookingLoading;
                        return (
                          <button
                            key={slot.startAt}
                            onClick={() => void handleBookSlot(slot.startAt)}
                            disabled={isBooking || bookingLoading}
                            style={{
                              padding: '12px',
                              backgroundColor: isBooking ? '#ccc' : '#007bff',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: isBooking ? 'not-allowed' : 'pointer',
                              fontSize: '14px',
                            }}
                          >
                            {isBooking
                              ? 'Reservando...'
                              : formatTimeLocal(slot.startAt)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ),
              );
            })()}
          </div>
        )}
      </div>

      {/* Booking Error */}
      {bookingError &&
        bookingError.status !== 401 &&
        bookingError.status !== 403 && (
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
            <strong>Error {bookingError.status}:</strong> {bookingError.detail}
            {bookingError.errors && (
              <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                {Object.entries(bookingError.errors).map(
                  ([field, messages]) => (
                    <li key={field}>
                      <strong>{field}:</strong> {messages.join(', ')}
                    </li>
                  ),
                )}
              </ul>
            )}
            {bookingError.status === 409 && (
              <div style={{ marginTop: '8px' }}>
                El turno ya fue tomado. Por favor, selecciona otro horario.
              </div>
            )}
          </div>
        )}

      {/* Booking Success */}
      {bookingSuccess && (
        <div
          style={{
            marginBottom: '16px',
            padding: '16px',
            backgroundColor: '#d4edda',
            border: '1px solid #c3e6cb',
            borderRadius: '4px',
            color: '#155724',
          }}
        >
          <h3 style={{ marginTop: 0 }}>¡Turno Reservado!</h3>
          <div style={{ marginBottom: '12px' }}>
            <div>
              <strong>Fecha:</strong>{' '}
              {new Date(bookingSuccess.appointment.startAt).toLocaleString(
                'es-AR',
              )}
            </div>
            <div>
              <strong>Estado:</strong> {bookingSuccess.appointment.status}
            </div>
            {bookingSuccess.payment.checkoutUrl && (
              <div style={{ marginTop: '12px' }}>
                <a
                  href={bookingSuccess.payment.checkoutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-block',
                    padding: '8px 16px',
                    backgroundColor: '#28a745',
                    color: 'white',
                    textDecoration: 'none',
                    borderRadius: '4px',
                  }}
                >
                  Ir a Pagar
                </a>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => navigate('/appointments')}
              style={{
                padding: '8px 16px',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Ver Mis Turnos
            </button>
            <button
              onClick={() => {
                setBookingSuccess(null);
                setSlots([]);
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
              Reservar Otro
            </button>
          </div>
        </div>
      )}

      {/* Patient Identity Modal */}
      {showIdentityModal && (
        <PatientIdentityModal
          isOpen={showIdentityModal}
          onClose={() => setShowIdentityModal(false)}
          onSuccess={() => {
            setShowIdentityModal(false);
            setBookingError(null);
            // Retry booking if there was a slot selected
            if (bookingSlot) {
              void handleBookSlot(bookingSlot);
            }
          }}
        />
      )}
    </div>
  );
}
