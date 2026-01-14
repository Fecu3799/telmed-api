import { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  listDoctorPatients,
  type PatientSummary,
} from '../api/doctor-patients';
import { type ProblemDetails } from '../api/http';

export function DoctorPatientDetailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { patientId } = useParams<{ patientId: string }>();
  const { getActiveToken, activeRole } = useAuth();

  // Try to get patient from navigation state first
  const patientFromState =
    location.state && 'patient' in location.state
      ? (location.state.patient as PatientSummary)
      : null;

  const [patient, setPatient] = useState<PatientSummary | null>(
    patientFromState,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ProblemDetails | null>(null);

  // Redirect if not doctor
  useEffect(() => {
    if (activeRole && activeRole !== 'doctor') {
      navigate('/lobby');
    }
  }, [activeRole, navigate]);

  // Load patient data only if not available from state
  useEffect(() => {
    // If we already have patient from state and it matches the patientId, skip loading
    if (patientFromState && patientFromState.id === patientId) {
      setPatient(patientFromState);
      return;
    }

    // If patientId doesn't match state or no state, we need to load
    const loadPatient = async () => {
      if (!getActiveToken() || activeRole !== 'doctor' || !patientId) {
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Search for the specific patient (with correct limit: max 50)
        const response = await listDoctorPatients({
          page: 1,
          limit: 50, // Maximum allowed by backend
        });

        const found = response.items.find((p) => p.id === patientId);
        if (!found) {
          setError({
            status: 404,
            detail: 'Paciente no encontrado o sin acceso',
          });
          setPatient(null);
        } else {
          setPatient(found);
        }
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
            detail: 'Error al cargar datos del paciente',
          });
        }
        setPatient(null);
      } finally {
        setLoading(false);
      }
    };

    void loadPatient();
  }, [patientId, getActiveToken, activeRole, patientFromState]);

  // Handle 401/403 -> redirect to login
  useEffect(() => {
    if (error && (error.status === 401 || error.status === 403)) {
      navigate('/login');
    }
  }, [error, navigate]);

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
        <h1 style={{ margin: 0 }}>Datos del Paciente</h1>
        <button
          onClick={() => navigate('/doctor-patients')}
          style={{
            padding: '8px 16px',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Volver a Mis Pacientes
        </button>
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

      {/* Patient Details */}
      {!loading && patient && (
        <div
          style={{
            border: '1px solid #ddd',
            borderRadius: '8px',
            padding: '24px',
            backgroundColor: 'white',
          }}
        >
          <h2 style={{ marginTop: 0 }}>{patient.fullName}</h2>

          <div style={{ marginBottom: '16px' }}>
            <strong>ID:</strong> {patient.id}
          </div>

          {patient.email && (
            <div style={{ marginBottom: '16px' }}>
              <strong>Email:</strong> {patient.email}
            </div>
          )}

          <div style={{ marginBottom: '16px' }}>
            <strong>Última interacción:</strong>{' '}
            {new Date(patient.lastInteractionAt).toLocaleString('es-AR')}
          </div>

          {patient.lastAppointmentAt && (
            <div style={{ marginBottom: '16px' }}>
              <strong>Último turno:</strong>{' '}
              {new Date(patient.lastAppointmentAt).toLocaleString('es-AR')}
            </div>
          )}

          {patient.lastConsultationAt && (
            <div style={{ marginBottom: '16px' }}>
              <strong>Última consulta:</strong>{' '}
              {new Date(patient.lastConsultationAt).toLocaleString('es-AR')}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', marginTop: '24px' }}>
            <button
              onClick={() => navigate(`/doctor-patients/${patient.id}/files`)}
              style={{
                padding: '8px 16px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Ver Archivos
            </button>
            <button
              onClick={() => navigate(`/doctor-patients/${patient.id}/history`)}
              style={{
                padding: '8px 16px',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Historia Clínica
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
