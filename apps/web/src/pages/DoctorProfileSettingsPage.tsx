import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  disconnectMyDoctorPaymentAccount,
  getMyDoctorPaymentAccount,
  upsertMyDoctorPaymentAccount,
  type DoctorPaymentAccount,
  type DoctorPaymentAccountStatus,
} from '../api/doctor-payment-account';
import {
  getDoctorDashboardOverview,
  listDoctorPayments,
  type DashboardRange,
  type DoctorDashboardOverview,
  type DoctorPaymentItem,
  type PaymentStatus,
} from '../api/doctor-dashboard';
import {
  getDoctorSpecialties,
  updateDoctorSpecialties,
  type DoctorSpecialtyOption,
} from '../api/doctor-specialties';
import { type ProblemDetails } from '../api/http';
import { DoctorAvailabilityPanel } from '../components/DoctorAvailabilityPanel';
import { DoctorLocationPanel } from '../components/DoctorLocationPanel';
import { DoctorProfileModal } from '../components/DoctorProfileModal';

const TABS = [
  { id: 'schedule', label: 'Agenda' },
  { id: 'data', label: 'Datos' },
  { id: 'location', label: 'Ubicación' },
  { id: 'specialties', label: 'Especialidades' },
  { id: 'payments', label: 'Pagos' },
  { id: 'metrics', label: 'Métricas' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString('es-AR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function getPaymentStatusConfig(status: PaymentStatus): {
  label: string;
  background: string;
  color: string;
  border: string;
} {
  switch (status) {
    case 'paid':
      return {
        label: 'Pagado',
        background: '#d1e7dd',
        color: '#0f5132',
        border: '#badbcc',
      };
    case 'pending':
      return {
        label: 'Pendiente',
        background: '#fff3cd',
        color: '#664d03',
        border: '#ffecb5',
      };
    case 'expired':
      return {
        label: 'Expirado',
        background: '#e2e3e5',
        color: '#41464b',
        border: '#d3d6d8',
      };
    case 'cancelled':
      return {
        label: 'Cancelado',
        background: '#f8d7da',
        color: '#842029',
        border: '#f5c2c7',
      };
    case 'failed':
      return {
        label: 'Fallido',
        background: '#f8d7da',
        color: '#842029',
        border: '#f5c2c7',
      };
    case 'refunded':
      return {
        label: 'Reembolsado',
        background: '#f8d7da',
        color: '#842029',
        border: '#f5c2c7',
      };
    default:
      return {
        label: status,
        background: '#f1f3f5',
        color: '#495057',
        border: '#dee2e6',
      };
  }
}

export function DoctorProfileSettingsPage() {
  const navigate = useNavigate();
  const { activeRole, getActiveToken } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('schedule');
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [metricsRange, setMetricsRange] = useState<DashboardRange>('30d');
  const [paymentsStatus, setPaymentsStatus] = useState<'all' | PaymentStatus>(
    'all',
  );
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState<ProblemDetails | null>(null);
  const [overview, setOverview] = useState<DoctorDashboardOverview | null>(
    null,
  );
  const [payments, setPayments] = useState<DoctorPaymentItem[]>([]);
  const [paymentsPageInfo, setPaymentsPageInfo] = useState<{
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  } | null>(null);
  const [paymentAccount, setPaymentAccount] =
    useState<DoctorPaymentAccount | null>(null);
  const [paymentAccountLoading, setPaymentAccountLoading] = useState(false);
  const [paymentAccountSubmitting, setPaymentAccountSubmitting] =
    useState(false);
  const [paymentAccountError, setPaymentAccountError] =
    useState<ProblemDetails | null>(null);
  const [devLabelInput, setDevLabelInput] = useState('');
  const [specialtiesLoading, setSpecialtiesLoading] = useState(false);
  const [specialtiesError, setSpecialtiesError] =
    useState<ProblemDetails | null>(null);
  const [specialtyOptions, setSpecialtyOptions] = useState<
    DoctorSpecialtyOption[]
  >([]);
  const [selectedSpecialtyIds, setSelectedSpecialtyIds] = useState<string[]>(
    [],
  );
  const [specialtiesSaving, setSpecialtiesSaving] = useState(false);
  const [specialtiesSaved, setSpecialtiesSaved] = useState(false);

  useEffect(() => {
    if (activeRole !== 'doctor') {
      navigate('/lobby');
    }
  }, [activeRole, navigate]);

  useEffect(() => {
    if (metricsError?.status === 401) {
      navigate('/login');
    }
  }, [metricsError, navigate]);

  useEffect(() => {
    if (paymentAccountError?.status === 401) {
      navigate('/login');
    }
  }, [paymentAccountError, navigate]);

  useEffect(() => {
    if (specialtiesError?.status === 401) {
      navigate('/login');
    }
  }, [specialtiesError, navigate]);

  useEffect(() => {
    if (activeTab !== 'metrics') {
      return;
    }
    if (!getActiveToken() || activeRole !== 'doctor') {
      return;
    }

    const loadMetrics = async () => {
      setMetricsLoading(true);
      setMetricsError(null);

      try {
        const [overviewResponse, paymentsResponse] = await Promise.all([
          getDoctorDashboardOverview(metricsRange),
          listDoctorPayments({
            page: paymentsPage,
            pageSize: 20,
            range: metricsRange,
            status: paymentsStatus === 'all' ? undefined : paymentsStatus,
          }),
        ]);

        setOverview(overviewResponse);
        setPayments(paymentsResponse.items);
        setPaymentsPageInfo(paymentsResponse.pageInfo);
      } catch (err) {
        const apiError = err as {
          problemDetails?: ProblemDetails;
          status?: number;
        };
        if (apiError.problemDetails) {
          setMetricsError(apiError.problemDetails);
        } else {
          setMetricsError({
            status: apiError.status || 500,
            detail: 'Error al cargar métricas',
          });
        }
        setOverview(null);
        setPayments([]);
        setPaymentsPageInfo(null);
      } finally {
        setMetricsLoading(false);
      }
    };

    void loadMetrics();
  }, [
    metricsRange,
    paymentsPage,
    paymentsStatus,
    getActiveToken,
    activeRole,
    activeTab,
  ]);

  useEffect(() => {
    if (activeTab !== 'payments') {
      return;
    }
    if (!getActiveToken() || activeRole !== 'doctor') {
      return;
    }

    const loadPaymentAccount = async () => {
      setPaymentAccountLoading(true);
      setPaymentAccountError(null);

      try {
        const account = await getMyDoctorPaymentAccount();
        setPaymentAccount(account);
        setDevLabelInput(account.devLabel ?? '');
      } catch (err) {
        const apiError = err as {
          problemDetails?: ProblemDetails;
          status?: number;
        };
        if (apiError.problemDetails) {
          setPaymentAccountError(apiError.problemDetails);
        } else {
          setPaymentAccountError({
            status: apiError.status || 500,
            detail: 'Error al cargar la cuenta de pagos',
          });
        }
        setPaymentAccount(null);
      } finally {
        setPaymentAccountLoading(false);
      }
    };

    void loadPaymentAccount();
  }, [activeTab, getActiveToken, activeRole]);

  useEffect(() => {
    if (activeTab !== 'specialties') {
      return;
    }
    if (!getActiveToken() || activeRole !== 'doctor') {
      return;
    }

    const loadSpecialties = async () => {
      setSpecialtiesLoading(true);
      setSpecialtiesError(null);
      setSpecialtiesSaved(false);

      try {
        const response = await getDoctorSpecialties();
        const options = (response.all ?? []).slice().sort((a, b) => {
          const orderDelta = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
          if (orderDelta !== 0) return orderDelta;
          return a.name.localeCompare(b.name);
        });
        const selected =
          response.selectedIds ?? response.specialties.map((item) => item.id);

        setSpecialtyOptions(options);
        setSelectedSpecialtyIds(selected);
      } catch (err) {
        const apiError = err as {
          problemDetails?: ProblemDetails;
          status?: number;
        };
        if (apiError.problemDetails) {
          setSpecialtiesError(apiError.problemDetails);
        } else {
          setSpecialtiesError({
            status: apiError.status || 500,
            detail: 'Error al cargar especialidades',
          });
        }
        setSpecialtyOptions([]);
        setSelectedSpecialtyIds([]);
      } finally {
        setSpecialtiesLoading(false);
      }
    };

    void loadSpecialties();
  }, [activeTab, getActiveToken, activeRole]);

  const accountStatus: DoctorPaymentAccountStatus =
    paymentAccount?.status ?? 'not_configured';
  const accountStatusLabel: Record<DoctorPaymentAccountStatus, string> = {
    not_configured: 'No configurada',
    connected: 'Conectada',
    disconnected: 'Desconectada',
  };
  const accountStatusColor: Record<DoctorPaymentAccountStatus, string> = {
    not_configured: '#6c757d',
    connected: '#198754',
    disconnected: '#dc3545',
  };

  const handleConnectAccount = async () => {
    if (paymentAccountSubmitting) {
      return;
    }
    setPaymentAccountSubmitting(true);
    setPaymentAccountError(null);

    try {
      const account = await upsertMyDoctorPaymentAccount({
        devLabel: devLabelInput.trim(),
      });
      setPaymentAccount(account);
      setDevLabelInput(account.devLabel ?? '');
    } catch (err) {
      const apiError = err as {
        problemDetails?: ProblemDetails;
        status?: number;
      };
      if (apiError.problemDetails) {
        setPaymentAccountError(apiError.problemDetails);
      } else {
        setPaymentAccountError({
          status: apiError.status || 500,
          detail: 'Error al conectar la cuenta',
        });
      }
    } finally {
      setPaymentAccountSubmitting(false);
    }
  };

  const handleDisconnectAccount = async () => {
    if (paymentAccountSubmitting) {
      return;
    }
    setPaymentAccountSubmitting(true);
    setPaymentAccountError(null);

    try {
      const account = await disconnectMyDoctorPaymentAccount();
      setPaymentAccount(account);
      setDevLabelInput('');
    } catch (err) {
      const apiError = err as {
        problemDetails?: ProblemDetails;
        status?: number;
      };
      if (apiError.problemDetails) {
        setPaymentAccountError(apiError.problemDetails);
      } else {
        setPaymentAccountError({
          status: apiError.status || 500,
          detail: 'Error al desconectar la cuenta',
        });
      }
    } finally {
      setPaymentAccountSubmitting(false);
    }
  };

  const toggleSpecialty = (id: string) => {
    setSpecialtiesSaved(false);
    setSelectedSpecialtyIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleSaveSpecialties = async () => {
    if (specialtiesSaving) {
      return;
    }

    setSpecialtiesSaving(true);
    setSpecialtiesError(null);
    try {
      const response = await updateDoctorSpecialties(selectedSpecialtyIds);
      setSelectedSpecialtyIds(
        response.selectedIds ?? response.specialties.map((item) => item.id),
      );
      setSpecialtiesSaved(true);
    } catch (err) {
      const apiError = err as {
        problemDetails?: ProblemDetails;
        status?: number;
      };
      if (apiError.problemDetails) {
        setSpecialtiesError(apiError.problemDetails);
      } else {
        setSpecialtiesError({
          status: apiError.status || 500,
          detail: 'Error al guardar especialidades',
        });
      }
    } finally {
      setSpecialtiesSaving(false);
    }
  };

  if (activeRole !== 'doctor') {
    return null;
  }

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
        <div>
          <h1 style={{ margin: 0 }}>Perfil del doctor</h1>
          <div style={{ color: '#666', fontSize: '14px' }}>
            Configuración y datos del perfil profesional.
          </div>
        </div>
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
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
          marginBottom: '16px',
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '8px 14px',
              borderRadius: '6px',
              border:
                activeTab === tab.id ? '1px solid #007bff' : '1px solid #ddd',
              backgroundColor: activeTab === tab.id ? '#e7f1ff' : '#fff',
              color: '#111',
              cursor: 'pointer',
              fontWeight: activeTab === tab.id ? 600 : 500,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div>
        {activeTab === 'schedule' && <DoctorAvailabilityPanel />}
        {activeTab === 'data' && (
          <div
            style={{
              border: '1px solid #ddd',
              borderRadius: '8px',
              padding: '16px',
              backgroundColor: '#fff',
            }}
          >
            <h2 style={{ marginTop: 0 }}>Datos profesionales</h2>
            <p style={{ color: '#666' }}>
              Editá tu perfil público (nombre, bio, precio, etc.).
            </p>
            <button
              onClick={() => setProfileModalOpen(true)}
              style={{
                padding: '8px 16px',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Editar perfil
            </button>
          </div>
        )}
        {activeTab === 'location' && <DoctorLocationPanel />}
        {activeTab === 'specialties' && (
          <div
            style={{
              border: '1px solid #ddd',
              borderRadius: '8px',
              padding: '16px',
              backgroundColor: '#fff',
            }}
          >
            <h2 style={{ marginTop: 0 }}>Especialidades</h2>
            <p style={{ color: '#666' }}>
              Seleccioná las especialidades que querés mostrar en tu perfil.
            </p>

            {specialtiesError && specialtiesError.status !== 401 && (
              <div
                style={{
                  border: '1px solid #f5c2c7',
                  backgroundColor: '#f8d7da',
                  color: '#842029',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  marginBottom: '12px',
                  fontSize: '14px',
                }}
              >
                {specialtiesError.status === 403
                  ? 'No autorizado'
                  : specialtiesError.detail}
              </div>
            )}

            {specialtiesLoading ? (
              <div style={{ color: '#666' }}>Cargando especialidades...</div>
            ) : specialtyOptions.length === 0 ? (
              <div style={{ color: '#666' }}>
                No hay especialidades activas para mostrar.
              </div>
            ) : (
              <>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '10px',
                    marginBottom: '12px',
                  }}
                >
                  {specialtyOptions.map((specialty) => {
                    const checked = selectedSpecialtyIds.includes(specialty.id);
                    return (
                      <label
                        key={specialty.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          border: checked
                            ? '1px solid #0d6efd'
                            : '1px solid #e3e6ea',
                          backgroundColor: checked ? '#e7f1ff' : '#fff',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSpecialty(specialty.id)}
                        />
                        <span>{specialty.name}</span>
                      </label>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    onClick={() => void handleSaveSpecialties()}
                    disabled={specialtiesSaving}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '6px',
                      border: '1px solid #0d6efd',
                      backgroundColor: '#0d6efd',
                      color: '#fff',
                      cursor: specialtiesSaving ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {specialtiesSaving ? 'Guardando...' : 'Guardar cambios'}
                  </button>
                  {specialtiesSaved && !specialtiesSaving && (
                    <div style={{ color: '#198754', alignSelf: 'center' }}>
                      Guardado
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
        {activeTab === 'payments' && (
          <div
            style={{
              border: '1px solid #ddd',
              borderRadius: '8px',
              padding: '16px',
              backgroundColor: '#fff',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
              }}
            >
              <div>
                <h2 style={{ margin: 0 }}>Pagos</h2>
                <div style={{ color: '#666', fontSize: '14px' }}>
                  Cuenta de cobros en modo desarrollo.
                </div>
              </div>
            </div>

            {paymentAccountError && paymentAccountError.status !== 401 && (
              <div
                style={{
                  border: '1px solid #f5c2c7',
                  backgroundColor: '#f8d7da',
                  color: '#842029',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  marginBottom: '12px',
                  fontSize: '14px',
                }}
              >
                {paymentAccountError.status === 403
                  ? 'No autorizado'
                  : paymentAccountError.detail}
              </div>
            )}

            <div
              style={{
                border: '1px solid #e3e6ea',
                borderRadius: '8px',
                padding: '16px',
                backgroundColor: '#f8f9fa',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                    Cuenta Mercado Pago (DEV)
                  </div>
                  <div style={{ fontSize: '13px', color: '#666' }}>
                    Modo desarrollo: esto NO recibe dinero real aún. Sirve para
                    preparar la conexión real en despliegue.
                  </div>
                </div>
                <div
                  style={{
                    padding: '4px 10px',
                    borderRadius: '999px',
                    backgroundColor: accountStatusColor[accountStatus],
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                >
                  {accountStatusLabel[accountStatus]}
                </div>
              </div>

              <div style={{ marginTop: '16px' }}>
                {paymentAccountLoading ? (
                  <div style={{ color: '#666' }}>Cargando estado...</div>
                ) : accountStatus === 'connected' ? (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '12px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '14px', color: '#666' }}>
                        Label DEV
                      </div>
                      <div style={{ fontWeight: 600 }}>
                        {paymentAccount?.devLabel ?? '-'}
                      </div>
                    </div>
                    <button
                      onClick={() => void handleDisconnectAccount()}
                      disabled={paymentAccountSubmitting}
                      style={{
                        padding: '8px 14px',
                        borderRadius: '6px',
                        border: '1px solid #dc3545',
                        backgroundColor: '#dc3545',
                        color: '#fff',
                        cursor: paymentAccountSubmitting
                          ? 'not-allowed'
                          : 'pointer',
                      }}
                    >
                      Desconectar
                    </button>
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <input
                      value={devLabelInput}
                      onChange={(event) => setDevLabelInput(event.target.value)}
                      placeholder="Label (DEV)"
                      disabled={paymentAccountSubmitting}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: '1px solid #ccc',
                        minWidth: '220px',
                      }}
                    />
                    <button
                      onClick={() => void handleConnectAccount()}
                      disabled={
                        paymentAccountSubmitting ||
                        devLabelInput.trim().length < 3
                      }
                      style={{
                        padding: '8px 14px',
                        borderRadius: '6px',
                        border: '1px solid #0d6efd',
                        backgroundColor: '#0d6efd',
                        color: '#fff',
                        cursor:
                          paymentAccountSubmitting ||
                          devLabelInput.trim().length < 3
                            ? 'not-allowed'
                            : 'pointer',
                      }}
                    >
                      Conectar (DEV)
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {activeTab === 'metrics' && (
          <div
            style={{
              border: '1px solid #ddd',
              borderRadius: '8px',
              padding: '16px',
              backgroundColor: '#fff',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
                gap: '12px',
                flexWrap: 'wrap',
              }}
            >
              <div>
                <h2 style={{ margin: 0 }}>Métricas</h2>
                <div style={{ color: '#666', fontSize: '14px' }}>
                  Resumen de pagos del período seleccionado.
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {(['7d', '30d', 'ytd'] as DashboardRange[]).map((range) => (
                  <button
                    key={range}
                    onClick={() => {
                      setMetricsRange(range);
                      setPaymentsPage(1);
                    }}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '999px',
                      border:
                        metricsRange === range
                          ? '1px solid #0d6efd'
                          : '1px solid #ddd',
                      backgroundColor:
                        metricsRange === range ? '#e7f1ff' : '#fff',
                      fontWeight: metricsRange === range ? 600 : 500,
                      cursor: 'pointer',
                    }}
                  >
                    {range === '7d' && '7 días'}
                    {range === '30d' && '30 días'}
                    {range === 'ytd' && 'Año'}
                  </button>
                ))}
              </div>
            </div>

            {metricsError && metricsError.status !== 401 && (
              <div
                style={{
                  border: '1px solid #f5c2c7',
                  backgroundColor: '#f8d7da',
                  color: '#842029',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  marginBottom: '12px',
                  fontSize: '14px',
                }}
              >
                {metricsError.status === 403
                  ? 'No autorizado'
                  : metricsError.detail}
              </div>
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '12px',
                marginBottom: '16px',
                opacity: metricsLoading ? 0.6 : 1,
              }}
            >
              <div
                style={{
                  border: '1px solid #e3e6ea',
                  borderRadius: '8px',
                  padding: '12px',
                  backgroundColor: '#f8f9fa',
                }}
              >
                <div style={{ color: '#6c757d', fontSize: '13px' }}>
                  Ganancias (bruto)
                </div>
                <div style={{ fontSize: '18px', fontWeight: 600 }}>
                  {formatMoney(
                    overview?.kpis.grossEarningsCents ?? 0,
                    overview?.currency ?? 'ARS',
                  )}
                </div>
              </div>
              <div
                style={{
                  border: '1px solid #e3e6ea',
                  borderRadius: '8px',
                  padding: '12px',
                  backgroundColor: '#f8f9fa',
                }}
              >
                <div style={{ color: '#6c757d', fontSize: '13px' }}>
                  Comisión TelMed
                </div>
                <div style={{ fontSize: '18px', fontWeight: 600 }}>
                  {formatMoney(
                    overview?.kpis.platformFeesCents ?? 0,
                    overview?.currency ?? 'ARS',
                  )}
                </div>
              </div>
              <div
                style={{
                  border: '1px solid #e3e6ea',
                  borderRadius: '8px',
                  padding: '12px',
                  backgroundColor: '#f8f9fa',
                }}
              >
                <div style={{ color: '#6c757d', fontSize: '13px' }}>
                  Total cobrado
                </div>
                <div style={{ fontSize: '18px', fontWeight: 600 }}>
                  {formatMoney(
                    overview?.kpis.totalChargedCents ?? 0,
                    overview?.currency ?? 'ARS',
                  )}
                </div>
              </div>
              <div
                style={{
                  border: '1px solid #e3e6ea',
                  borderRadius: '8px',
                  padding: '12px',
                  backgroundColor: '#f8f9fa',
                }}
              >
                <div style={{ color: '#6c757d', fontSize: '13px' }}>
                  Pagos (paid)
                </div>
                <div style={{ fontSize: '18px', fontWeight: 600 }}>
                  {overview?.kpis.paidPaymentsCount ?? 0}
                </div>
              </div>
              <div
                style={{
                  border: '1px solid #e3e6ea',
                  borderRadius: '8px',
                  padding: '12px',
                  backgroundColor: '#f8f9fa',
                }}
              >
                <div style={{ color: '#6c757d', fontSize: '13px' }}>
                  Pacientes
                </div>
                <div style={{ fontSize: '18px', fontWeight: 600 }}>
                  {overview?.kpis.uniquePatientsCount ?? 0}
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                flexWrap: 'wrap',
                marginBottom: '12px',
              }}
            >
              <div style={{ fontWeight: 600 }}>Pagos</div>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <span style={{ fontSize: '14px', color: '#666' }}>Estado</span>
                <select
                  value={paymentsStatus}
                  onChange={(event) => {
                    const value = event.target.value as 'all' | PaymentStatus;
                    setPaymentsStatus(value);
                    setPaymentsPage(1);
                  }}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid #ccc',
                  }}
                >
                  <option value="all">Todos</option>
                  <option value="paid">Pagado</option>
                  <option value="pending">Pendiente</option>
                  <option value="expired">Expirado</option>
                  <option value="cancelled">Cancelado</option>
                  <option value="failed">Fallido</option>
                  <option value="refunded">Reembolsado</option>
                </select>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '14px',
                }}
              >
                <thead>
                  <tr
                    style={{
                      textAlign: 'left',
                      borderBottom: '1px solid #eee',
                    }}
                  >
                    <th style={{ padding: '8px' }}>Fecha</th>
                    <th style={{ padding: '8px' }}>Tipo</th>
                    <th style={{ padding: '8px' }}>Monto</th>
                    <th style={{ padding: '8px' }}>Estado</th>
                    <th style={{ padding: '8px' }}>Paciente</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => {
                    const kindLabel =
                      payment.kind === 'appointment' ? 'Turno' : 'Emergencia';
                    const statusConfig = getPaymentStatusConfig(payment.status);
                    return (
                      <tr
                        key={payment.id}
                        style={{ borderBottom: '1px solid #f0f0f0' }}
                      >
                        <td style={{ padding: '8px' }}>
                          {formatDate(payment.createdAt)}
                        </td>
                        <td style={{ padding: '8px' }}>{kindLabel}</td>
                        <td style={{ padding: '8px' }}>
                          {formatMoney(
                            payment.grossAmountCents,
                            payment.currency,
                          )}
                        </td>
                        <td style={{ padding: '8px' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '2px 8px',
                              borderRadius: '999px',
                              border: `1px solid ${statusConfig.border}`,
                              backgroundColor: statusConfig.background,
                              color: statusConfig.color,
                              fontSize: '12px',
                              fontWeight: 600,
                            }}
                          >
                            {statusConfig.label}
                          </span>
                        </td>
                        <td style={{ padding: '8px' }}>
                          {payment.patient?.displayName ??
                            payment.patient?.id ??
                            '-'}
                        </td>
                      </tr>
                    );
                  })}
                  {!metricsLoading && payments.length === 0 && (
                    <tr>
                      <td
                        style={{ padding: '12px', color: '#666' }}
                        colSpan={5}
                      >
                        Sin pagos en este período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '12px',
                gap: '12px',
                flexWrap: 'wrap',
              }}
            >
              <button
                onClick={() => setPaymentsPage((prev) => Math.max(1, prev - 1))}
                disabled={!paymentsPageInfo?.hasPrevPage || metricsLoading}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #ddd',
                  backgroundColor: '#fff',
                  cursor:
                    paymentsPageInfo?.hasPrevPage && !metricsLoading
                      ? 'pointer'
                      : 'not-allowed',
                }}
              >
                Anterior
              </button>
              <div style={{ fontSize: '13px', color: '#666' }}>
                Página {paymentsPageInfo?.page ?? paymentsPage} de{' '}
                {paymentsPageInfo?.totalPages ?? 0}
              </div>
              <button
                onClick={() => setPaymentsPage((prev) => prev + 1)}
                disabled={!paymentsPageInfo?.hasNextPage || metricsLoading}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #ddd',
                  backgroundColor: '#fff',
                  cursor:
                    paymentsPageInfo?.hasNextPage && !metricsLoading
                      ? 'pointer'
                      : 'not-allowed',
                }}
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      <DoctorProfileModal
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        onSuccess={() => setProfileModalOpen(false)}
      />
    </div>
  );
}
