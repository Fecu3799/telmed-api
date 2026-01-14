import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useEffect } from 'react';
import { PatientFilesPanel } from '../components/PatientFilesPanel';

export function DoctorPatientFilesPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const { activeRole } = useAuth();
  const navigate = useNavigate();

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
        <h1 style={{ margin: 0 }}>Archivos del Paciente</h1>
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
          Volver a Datos del Paciente
        </button>
      </div>

      {patientId && (
        <PatientFilesPanel
          patientId={patientId}
          showUpload={true}
          showPatientSelector={false}
          compact={false}
        />
      )}
    </div>
  );
}
