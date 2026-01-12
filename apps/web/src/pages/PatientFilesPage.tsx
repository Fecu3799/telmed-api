import { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { PatientFilesPanel } from '../components/PatientFilesPanel';
import { getMe, type AuthMeResponse } from '../api/auth';

export function PatientFilesPage() {
  const { activeRole } = useAuth();
  const [patientId, setPatientId] = useState('');
  const [sessionStatus, setSessionStatus] = useState<AuthMeResponse | null>(
    null,
  );

  // Load session status for doctor mode
  useEffect(() => {
    const loadSession = async () => {
      if (activeRole !== 'doctor') {
        setSessionStatus(null);
        return;
      }

      try {
        const status = await getMe();
        setSessionStatus(status);
      } catch {
        setSessionStatus(null);
      }
    };

    void loadSession();
  }, [activeRole]);

  return (
    <div style={{ padding: '16px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ marginTop: 0 }}>Archivos del Paciente</h1>

      {/* Doctor mode: patient selector */}
      {activeRole === 'doctor' && (
        <div
          style={{
            marginBottom: '16px',
            padding: '12px',
            backgroundColor: '#f5f5f5',
            borderRadius: '4px',
          }}
        >
          <label style={{ display: 'block', marginBottom: '8px' }}>
            <strong>Patient ID (para pruebas):</strong>
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              placeholder="Ingresa patientUserId (o deja vacío para usar /patients/me)"
              style={{
                flex: 1,
                padding: '8px',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
            />
            {sessionStatus && (
              <span style={{ padding: '8px', color: '#666' }}>
                Tu ID: {sessionStatus.id}
              </span>
            )}
          </div>
          <div style={{ marginTop: '8px', fontSize: '14px', color: '#666' }}>
            {patientId
              ? `Usando: /patients/${patientId}/files`
              : 'Usando: /patients/me/files (requiere login como patient)'}
          </div>
        </div>
      )}

      <PatientFilesPanel
        patientId={patientId || undefined}
        showUpload={true}
        showPatientSelector={false}
        compact={false}
      />
    </div>
  );
}
