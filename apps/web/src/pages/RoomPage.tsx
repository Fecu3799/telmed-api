import { useParams, useNavigate } from 'react-router-dom';

export function RoomPage() {
  const { consultationId } = useParams<{ consultationId: string }>();
  const navigate = useNavigate();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        padding: '20px',
      }}
    >
      <div>
        <h1>Consultation Room placeholder</h1>
        <p>Consultation ID: {consultationId}</p>
        <button
          onClick={() => navigate('/lobby')}
          style={{
            padding: '8px 16px',
            border: 'none',
            borderRadius: '4px',
            backgroundColor: '#007bff',
            color: 'white',
            cursor: 'pointer',
            marginTop: '16px',
          }}
        >
          Back to Lobby
        </button>
      </div>
    </div>
  );
}
