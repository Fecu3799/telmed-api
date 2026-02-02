import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
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

export function DoctorProfileSettingsPage() {
  const navigate = useNavigate();
  const { activeRole } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('schedule');
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  useEffect(() => {
    if (activeRole !== 'doctor') {
      navigate('/lobby');
    }
  }, [activeRole, navigate]);

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
              Próximamente vas a poder gestionar tus especialidades desde acá.
            </p>
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
            <h2 style={{ marginTop: 0 }}>Pagos</h2>
            <p style={{ color: '#666' }}>
              Próximamente vas a poder configurar tu cuenta de pagos.
            </p>
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
            <h2 style={{ marginTop: 0 }}>Métricas</h2>
            <p style={{ color: '#666' }}>Sección en preparación.</p>
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
