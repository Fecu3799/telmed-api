import type { ConsultationStatus } from '../api/consultations';

type LobbyTopActionsProps = {
  role: 'doctor' | 'patient';
  onSearchDoctors: () => void;
  onOpenChats: () => void;
  onOpenProfile?: () => void;
  onOpenPatientHistory?: () => void;
  activeConsultationId?: string | null;
  activeConsultationStatus?: ConsultationStatus | null;
  onOpenActiveConsultation?: () => void;
};

export function LobbyTopActions({
  role,
  onSearchDoctors,
  onOpenChats,
  onOpenProfile,
  onOpenPatientHistory,
  activeConsultationId,
  activeConsultationStatus,
  onOpenActiveConsultation,
}: LobbyTopActionsProps) {
  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      <button
        onClick={onSearchDoctors}
        style={{
          padding: '8px 16px',
          backgroundColor: '#28a745',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '0.9em',
        }}
      >
        Buscar médicos
      </button>
      {role === 'patient' &&
        activeConsultationId &&
        onOpenActiveConsultation && (
          <button
            onClick={onOpenActiveConsultation}
            disabled={activeConsultationStatus !== 'in_progress'}
            style={{
              padding: '8px 16px',
              backgroundColor:
                activeConsultationStatus === 'in_progress'
                  ? '#007bff'
                  : '#9ca3af',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor:
                activeConsultationStatus === 'in_progress'
                  ? 'pointer'
                  : 'not-allowed',
              fontSize: '0.9em',
            }}
          >
            {activeConsultationStatus === 'in_progress'
              ? 'Entrar a consulta'
              : 'Consulta cerrada'}
          </button>
        )}
      <button
        onClick={onOpenChats}
        style={{
          padding: '8px 16px',
          backgroundColor: '#2196F3',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '0.9em',
        }}
      >
        Open Chats
      </button>
      {role === 'doctor' && onOpenProfile && (
        <button
          onClick={onOpenProfile}
          style={{
            padding: '8px 16px',
            backgroundColor: '#343a40',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.9em',
          }}
        >
          Mi perfil
        </button>
      )}
      {role === 'patient' && onOpenPatientHistory && (
        <button
          onClick={onOpenPatientHistory}
          style={{
            padding: '8px 16px',
            backgroundColor: '#6f42c1',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.9em',
          }}
        >
          Historia Clínica
        </button>
      )}
    </div>
  );
}
