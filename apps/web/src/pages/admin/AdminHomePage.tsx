import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  getAdminMetricsOverview,
  getAdminMetricsHealth,
  getAdminMetricsJobs,
  type AdminMetricsOverview,
  type AdminMetricsHealth,
  type AdminMetricsJobs,
} from '../../api/admin-metrics';
import type { ApiError, ProblemDetails } from '../../api/http';
import { useAuth } from '../../auth/AuthContext';

export function AdminHomePage() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [overview, setOverview] = useState<AdminMetricsOverview | null>(null);
  const [health, setHealth] = useState<AdminMetricsHealth | null>(null);
  const [jobs, setJobs] = useState<AdminMetricsJobs | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ProblemDetails | null>(null);

  const loadMetrics = async () => {
    setLoading(true);
    setError(null);
    try {
      const [overviewResponse, healthResponse, jobsResponse] =
        await Promise.all([
          getAdminMetricsOverview(),
          getAdminMetricsHealth(),
          getAdminMetricsJobs(),
        ]);
      setOverview(overviewResponse);
      setHealth(healthResponse);
      setJobs(jobsResponse);
    } catch (err) {
      const apiError = err as ApiError;
      if (apiError.status === 401) {
        logout();
        navigate('/login');
        return;
      }
      setError(
        apiError.problemDetails || {
          status: apiError.status || 500,
          detail: apiError.message || 'Error al cargar métricas',
        },
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMetrics();
  }, []);

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}
      >
        <div>
          <h2 style={{ marginTop: 0 }}>Panel de administración</h2>
          <p style={{ color: '#6b7280', marginBottom: 0 }}>
            Accesos rápidos y métricas operativas.
          </p>
        </div>
        <button
          onClick={() => void loadMetrics()}
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            backgroundColor: '#fff',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          {loading ? 'Actualizando...' : 'Refrescar'}
        </button>
      </div>

      {error && (
        <div
          style={{
            marginBottom: '16px',
            padding: '12px',
            backgroundColor: '#fee',
            border: '1px solid #fcc',
            borderRadius: '6px',
            color: '#b91c1c',
          }}
        >
          {error.status === 403 ? 'No autorizado' : error.detail}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <Link
          to="/admin/specialties"
          style={{
            textDecoration: 'none',
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '10px',
            padding: '16px',
            color: '#111827',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: '6px' }}>
            Specialties
          </div>
          <div style={{ color: '#6b7280', fontSize: '13px' }}>
            Administrar catálogo y estados.
          </div>
        </Link>

        <div
          style={{
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '10px',
            padding: '16px',
            color: '#111827',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: '6px' }}>
            Usuarios totales
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700 }}>
            {overview?.users.total ?? '—'}
          </div>
          {overview?.users.byRole && (
            <div style={{ color: '#6b7280', fontSize: '12px' }}>
              doctor: {overview.users.byRole.doctor ?? 0} · patient:{' '}
              {overview.users.byRole.patient ?? 0} · admin:{' '}
              {overview.users.byRole.admin ?? 0}
            </div>
          )}
        </div>

        <div
          style={{
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '10px',
            padding: '16px',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: '6px' }}>
            Specialties activas
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700 }}>
            {overview?.specialties?.active ?? '—'}
          </div>
          <div style={{ color: '#6b7280', fontSize: '12px' }}>
            Inactivas: {overview?.specialties?.inactive ?? 0}
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '10px',
            padding: '16px',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: '6px' }}>
            Turnos totales
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700 }}>
            {overview?.appointments?.total ?? '—'}
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '10px',
            padding: '16px',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: '6px' }}>
            Consultas totales
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700 }}>
            {overview?.consultations?.total ?? '—'}
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '16px',
        }}
      >
        <div
          style={{
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '10px',
            padding: '16px',
          }}
        >
          <h3 style={{ marginTop: 0 }}>Health</h3>
          {!health ? (
            <div style={{ color: '#6b7280' }}>Cargando...</div>
          ) : (
            <div>
              <div style={{ marginBottom: '8px' }}>
                Estado general:{' '}
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '999px',
                    backgroundColor: health.ok ? '#dcfce7' : '#fee2e2',
                    color: health.ok ? '#166534' : '#b91c1c',
                    fontSize: '12px',
                    fontWeight: 700,
                  }}
                >
                  {health.ok ? 'OK' : 'Error'}
                </span>
              </div>
              <div style={{ color: '#374151', fontSize: '13px' }}>
                DB: {health.checks.db.ok ? 'OK' : 'Error'} ·{' '}
                {health.checks.db.latencyMs ?? '—'} ms
              </div>
              {health.checks.redis && (
                <div style={{ color: '#374151', fontSize: '13px' }}>
                  Redis: {health.checks.redis.ok ? 'OK' : 'Error'} ·{' '}
                  {health.checks.redis.latencyMs ?? '—'} ms
                </div>
              )}
            </div>
          )}
        </div>

        <div
          style={{
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '10px',
            padding: '16px',
          }}
        >
          <h3 style={{ marginTop: 0 }}>Jobs</h3>
          {!jobs ? (
            <div style={{ color: '#6b7280' }}>Cargando...</div>
          ) : jobs.queues.length === 0 ? (
            <div style={{ color: '#6b7280' }}>
              {jobs.note ?? 'Sin colas configuradas.'}
            </div>
          ) : (
            jobs.queues.map((queue) => (
              <div key={queue.name} style={{ marginBottom: '12px' }}>
                <div style={{ fontWeight: 700 }}>{queue.name}</div>
                <div style={{ color: '#374151', fontSize: '12px' }}>
                  waiting: {queue.counts.waiting} · active:{' '}
                  {queue.counts.active} · completed: {queue.counts.completed} ·
                  failed: {queue.counts.failed} · delayed:{' '}
                  {queue.counts.delayed}
                </div>
                {queue.recentFailed && queue.recentFailed.length > 0 && (
                  <div style={{ marginTop: '6px', fontSize: '12px' }}>
                    <div style={{ color: '#b91c1c', fontWeight: 600 }}>
                      Últimos fallos
                    </div>
                    <ul style={{ margin: '4px 0 0 16px', color: '#6b7280' }}>
                      {queue.recentFailed.map((job) => (
                        <li key={job.id}>
                          {job.name} ({job.id})
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
