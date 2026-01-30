import { Link } from 'react-router-dom';

export function AdminHomePage() {
  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Panel de administración</h2>
      <p style={{ color: '#6b7280', marginBottom: '24px' }}>
        Accesos rápidos para gestión operativa.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
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
            backgroundColor: '#f3f4f6',
            border: '1px dashed #d1d5db',
            borderRadius: '10px',
            padding: '16px',
            color: '#6b7280',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: '6px' }}>Métricas</div>
          <div style={{ fontSize: '13px' }}>Coming soon</div>
        </div>
      </div>
    </div>
  );
}
