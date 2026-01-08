import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext';
import { listThreads, getOrCreateThread, type ChatThread } from '../api/chats';
import { ChatThreadPanel } from '../components/ChatThreadPanel';

export function ChatsPage() {
  const { getActiveToken, activeRole } = useAuth();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedThread, setSelectedThread] = useState<ChatThread | null>(null);
  const [otherUserId, setOtherUserId] = useState('');
  const [creatingThread, setCreatingThread] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadThreads = useCallback(async () => {
    if (!getActiveToken()) {
      return;
    }

    setLoadingThreads(true);
    setError(null);
    try {
      const data = await listThreads();
      setThreads(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load threads');
    } finally {
      setLoadingThreads(false);
    }
  }, [getActiveToken]);

  const handleGetOrCreateThread = async () => {
    if (!otherUserId.trim()) {
      return;
    }

    setCreatingThread(true);
    setError(null);
    try {
      const thread = await getOrCreateThread(otherUserId.trim());
      setThreads((prev) => {
        // Add or update thread in list
        const exists = prev.findIndex((t) => t.id === thread.id);
        if (exists >= 0) {
          const updated = [...prev];
          updated[exists] = thread;
          return updated;
        }
        return [thread, ...prev];
      });
      setSelectedThreadId(thread.id);
      setSelectedThread(thread);
      setOtherUserId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create thread');
    } finally {
      setCreatingThread(false);
    }
  };

  const handleSelectThread = (thread: ChatThread) => {
    setSelectedThreadId(thread.id);
    setSelectedThread(thread);
  };

  // Load threads on mount
  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  const otherUser = selectedThread
    ? activeRole === 'doctor'
      ? selectedThread.patient
      : selectedThread.doctor
    : undefined;

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        padding: '16px',
        gap: '16px',
      }}
    >
      {/* Left Panel */}
      <div
        style={{
          width: '400px',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid #ccc',
          borderRadius: '4px',
          padding: '16px',
        }}
      >
        <h2 style={{ marginTop: 0 }}>Chat Threads</h2>

        {/* Refresh button */}
        <button
          onClick={() => void loadThreads()}
          disabled={loadingThreads}
          style={{
            padding: '8px 16px',
            marginBottom: '16px',
            backgroundColor: '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loadingThreads ? 'not-allowed' : 'pointer',
          }}
        >
          {loadingThreads ? 'Loading...' : 'Refresh Threads'}
        </button>

        {/* Get/Create thread */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>
            Get/Create Thread:
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={otherUserId}
              onChange={(e) => setOtherUserId(e.target.value)}
              placeholder="Other user ID"
              style={{
                flex: 1,
                padding: '8px',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  void handleGetOrCreateThread();
                }
              }}
            />
            <button
              onClick={() => void handleGetOrCreateThread()}
              disabled={creatingThread || !otherUserId.trim()}
              style={{
                padding: '8px 16px',
                backgroundColor: creatingThread ? '#ccc' : '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: creatingThread ? 'not-allowed' : 'pointer',
              }}
            >
              {creatingThread ? 'Creating...' : 'Get/Create'}
            </button>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div
            style={{
              padding: '8px',
              marginBottom: '16px',
              backgroundColor: '#ffebee',
              color: '#c62828',
              borderRadius: '4px',
              fontSize: '0.9em',
            }}
          >
            {error}
          </div>
        )}

        {/* Threads list */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {threads.length === 0 && !loadingThreads && (
            <div
              style={{ color: '#666', textAlign: 'center', padding: '16px' }}
            >
              No threads yet. Create one above.
            </div>
          )}
          {threads.map((thread) => {
            const other =
              activeRole === 'doctor' ? thread.patient : thread.doctor;
            const displayName = other?.displayName || other?.email || 'Unknown';
            const isSelected = selectedThreadId === thread.id;

            return (
              <div
                key={thread.id}
                onClick={() => handleSelectThread(thread)}
                style={{
                  padding: '12px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  backgroundColor: isSelected ? '#e3f2fd' : 'white',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = '#f5f5f5';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = 'white';
                  }
                }}
              >
                <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                  {displayName}
                </div>
                <div style={{ fontSize: '0.85em', color: '#666' }}>
                  Thread: {thread.id.substring(0, 8)}...
                </div>
                {thread.lastMessageAt && (
                  <div
                    style={{
                      fontSize: '0.75em',
                      color: '#999',
                      marginTop: '4px',
                    }}
                  >
                    Last: {new Date(thread.lastMessageAt).toLocaleString()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {selectedThreadId ? (
          <ChatThreadPanel threadId={selectedThreadId} otherUser={otherUser} />
        ) : (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid #ccc',
              borderRadius: '4px',
              color: '#666',
            }}
          >
            Select a thread to start chatting
          </div>
        )}
      </div>
    </div>
  );
}
