import { useState } from 'react';
import { ChatThreadPanel } from './ChatThreadPanel';

interface ChatDrawerProps {
  threadId: string | null;
  otherUser?: {
    id: string;
    email: string;
    displayName: string | null;
  };
  autoConnect?: boolean;
  autoJoin?: boolean;
  error?: string | null;
}

export function ChatDrawer({
  threadId,
  otherUser,
  autoConnect = true,
  autoJoin = true,
  error,
}: ChatDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Toggle Button - Fixed position */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed',
          top: '16px',
          right: isOpen ? '420px' : '16px',
          zIndex: 1000,
          padding: '12px 16px',
          backgroundColor: '#2196F3',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: '500',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
          transition: 'right 0.3s ease',
        }}
      >
        {isOpen ? '← Hide Chat' : 'Show Chat →'}
      </button>

      {/* Drawer Panel */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            width: '400px',
            height: '100vh',
            backgroundColor: '#ffffff',
            borderLeft: '1px solid #e5e5e5',
            boxShadow: '-2px 0 8px rgba(0, 0, 0, 0.1)',
            zIndex: 999,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {error ? (
            <div
              style={{
                padding: '20px',
                backgroundColor: '#fee',
                borderBottom: '1px solid #fcc',
                color: '#c33',
              }}
            >
              <strong>Chat unavailable:</strong> {error}
            </div>
          ) : threadId ? (
            <ChatThreadPanel
              threadId={threadId}
              otherUser={otherUser}
              autoConnect={autoConnect}
              autoJoin={autoJoin}
            />
          ) : (
            <div
              style={{
                padding: '20px',
                textAlign: 'center',
                color: '#666',
              }}
            >
              Loading chat...
            </div>
          )}
        </div>
      )}
    </>
  );
}
