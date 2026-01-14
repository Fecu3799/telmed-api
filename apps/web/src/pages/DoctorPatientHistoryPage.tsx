import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useEffect } from 'react';

export function DoctorPatientHistoryPage() {
  const navigate = useNavigate();
  const { patientId } = useParams<{ patientId: string }>();
  const { activeRole } = useAuth();

  // Redirect if not doctor
  useEffect(() => {
    if (activeRole && activeRole !== 'doctor') {
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
        <h1 style={{ margin: 0 }}>Historia Clínica</h1>
        <button
          onClick={() => navigate(`/doctor-patients/${patientId}`)}
          style={{
            padding: '8px 16px',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Volver
        </button>
      </div>

      <div
        style={{
          border: '1px solid #ddd',
          borderRadius: '8px',
          padding: '48px',
          backgroundColor: 'white',
          textAlign: 'center',
          color: '#666',
        }}
      >
        <h2 style={{ marginTop: 0 }}>Próximamente</h2>
        <p>
          La funcionalidad de Historia Clínica estará disponible próximamente.
        </p>
        <button
          onClick={() => navigate(`/doctor-patients/${patientId}`)}
          style={{
            marginTop: '16px',
            padding: '8px 16px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Volver a Datos del Paciente
        </button>
      </div>
    </div>
  );
}
