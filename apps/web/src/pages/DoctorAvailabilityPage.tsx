import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { DoctorAvailabilityPanel } from '../components/DoctorAvailabilityPanel';

export function DoctorAvailabilityPage() {
  const navigate = useNavigate();
  const { activeRole } = useAuth();

  // Redirect if not doctor
  useEffect(() => {
    if (activeRole !== 'doctor') {
      navigate('/lobby');
    }
  }, [activeRole, navigate]);

  if (activeRole !== 'doctor') {
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
        <h1 style={{ margin: 0 }}>Mi Disponibilidad</h1>
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

      <DoctorAvailabilityPanel />
    </div>
  );
}
