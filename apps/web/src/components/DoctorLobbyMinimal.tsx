type DoctorLobbyMinimalProps = {
  isOnline: boolean;
  presenceLoading: boolean;
  onTogglePresence: () => void;
  onOpenAppointments: () => void;
  onOpenPatients: () => void;
};

export function DoctorLobbyMinimal({
  isOnline,
  presenceLoading,
  onTogglePresence,
  onOpenAppointments,
  onOpenPatients,
}: DoctorLobbyMinimalProps) {
  const sectionStyle = {
    border: '1px solid #ddd',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px',
  };

  const buttonStyle = {
    padding: '8px 16px',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: '#007bff',
    color: 'white',
    cursor: 'pointer',
    marginRight: '8px',
    marginBottom: '8px',
  };

  return (
    <div style={sectionStyle}>
      <h2>Acciones del doctor</h2>
      <div
        style={{
          marginTop: '8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <button
          onClick={onTogglePresence}
          disabled={presenceLoading}
          style={{
            ...buttonStyle,
            backgroundColor: isOnline ? '#dc3545' : '#28a745',
          }}
        >
          {presenceLoading
            ? 'Actualizando...'
            : isOnline
              ? 'Pasar offline'
              : 'Pasar online'}
        </button>
        <button
          onClick={onOpenAppointments}
          style={{
            ...buttonStyle,
            backgroundColor: '#007bff',
          }}
        >
          Mis Turnos
        </button>
        <button
          onClick={onOpenPatients}
          style={{
            ...buttonStyle,
            backgroundColor: '#6f42c1',
          }}
        >
          Mis Pacientes
        </button>
      </div>
    </div>
  );
}
