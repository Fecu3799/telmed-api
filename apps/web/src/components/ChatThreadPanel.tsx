import { useState, useEffect, useRef, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';
import { config } from '../config/env';
import { useAuth } from '../auth/AuthContext';
import {
  getThreadMessages,
  type ChatMessage,
  type MessagesResponse,
} from '../api/chats';

interface ChatThreadPanelProps {
  threadId: string;
  otherUser?: {
    id: string;
    email: string;
    displayName: string | null;
  };
  autoConnect?: boolean;
  autoJoin?: boolean;
}

interface DebugLog {
  id: string;
  timestamp: string;
  type: string;
  message: string;
  data?: unknown;
}

interface OptimisticMessage extends ChatMessage {
  optimistic: true;
  sending: boolean;
  failed?: boolean;
  errorCode?: string;
}

type MessageWithOptimistic = ChatMessage | OptimisticMessage;

function isOptimistic(msg: MessageWithOptimistic): msg is OptimisticMessage {
  return 'optimistic' in msg && msg.optimistic === true;
}

export function ChatThreadPanel({
  threadId,
  otherUser,
  autoConnect = false,
  autoJoin = false,
}: ChatThreadPanelProps) {
  const { getActiveToken } = useAuth();
  const [connected, setConnected] = useState(false);
  const [joined, setJoined] = useState(false);
  const [messages, setMessages] = useState<MessageWithOptimistic[]>([]);
  const [messagesPageInfo, setMessagesPageInfo] = useState<{
    hasNextPage: boolean;
    endCursor: string | null;
  } | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [debugLogs, setDebugLogs] = useState<DebugLog[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);

  // Add debug log
  const addDebugLog = useCallback(
    (type: string, message: string, data?: unknown) => {
      const log: DebugLog = {
        id: `${Date.now()}-${Math.random()}`,
        timestamp: new Date().toISOString(),
        type,
        message,
        data,
      };
      setDebugLogs((prev) => {
        const updated = [log, ...prev].slice(0, 30); // Keep last 30
        return updated;
      });
    },
    [],
  );

  // Connect WebSocket
  const connectSocket = useCallback(() => {
    const token = getActiveToken();
    if (!token) {
      addDebugLog('error', 'No token available');
      return;
    }

    if (socketRef.current?.connected) {
      addDebugLog('info', 'Socket already connected');
      return;
    }

    const serverUrl = config.SOCKET_URL || window.location.origin;
    const newSocket = io(`${serverUrl}/chats`, {
      path: '/socket.io',
      auth: {
        token: token.startsWith('Bearer ') ? token.slice(7) : token,
      },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    newSocket.on('connect', () => {
      addDebugLog('connect', 'Socket connected', { socketId: newSocket.id });
      setConnected(true);
    });

    newSocket.on('connect_error', (error) => {
      addDebugLog('connect_error', 'Connection error', {
        error: error.message,
      });
      setConnected(false);
    });

    newSocket.on('disconnect', (reason) => {
      addDebugLog('disconnect', 'Socket disconnected', { reason });
      setConnected(false);
      setJoined(false);
    });

    newSocket.on('chat:message', (payload: { message: ChatMessage }) => {
      addDebugLog('chat:message', 'Received message', {
        messageId: payload.message.id,
        text: payload.message.text.substring(0, 50),
      });
      setMessages((prev) => {
        // Dedupe: don't add if message.id already exists
        const exists = prev.some((m) => m.id === payload.message.id);
        if (exists) {
          return prev;
        }
        // Remove optimistic message with same clientMessageId if exists
        const filtered = prev.filter(
          (m) =>
            !isOptimistic(m) ||
            m.clientMessageId !== payload.message.clientMessageId,
        );
        return [...filtered, payload.message].sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
      });
    });

    socketRef.current = newSocket;
  }, [getActiveToken, addDebugLog]);

  // Disconnect WebSocket
  const disconnectSocket = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setConnected(false);
      setJoined(false);
      addDebugLog('info', 'Socket disconnected manually');
    }
  }, [addDebugLog]);

  // Join thread
  const joinThread = useCallback(() => {
    if (!socketRef.current?.connected) {
      addDebugLog('error', 'Socket not connected');
      return;
    }

    addDebugLog('info', 'Joining thread', { threadId });

    socketRef.current.emit(
      'chat:join',
      { threadId },
      (response: {
        ok: boolean;
        data?: { threadId: string };
        error?: { code: string; message: string };
      }) => {
        if (response.ok) {
          addDebugLog('ack', 'Join ACK success', {
            threadId: response.data?.threadId,
          });
          setJoined(true);
        } else {
          addDebugLog('ack_error', 'Join ACK failed', {
            code: response.error?.code,
            message: response.error?.message,
          });
          setJoined(false);
        }
      },
    );
  }, [threadId, addDebugLog]);

  // Load history
  const loadHistory = useCallback(
    async (cursor?: string) => {
      setLoadingHistory(true);
      try {
        const response: MessagesResponse = await getThreadMessages(threadId, {
          cursor,
          limit: 50,
        });
        setMessagesPageInfo(response.pageInfo);

        // Messages come in desc order, reverse for display
        const reversed = [...response.items].reverse();

        setMessages((prev) => {
          // Merge and dedupe by id
          const existingIds = new Set(prev.map((m) => m.id));
          const newMessages = reversed.filter((m) => !existingIds.has(m.id));
          const combined = [...prev, ...newMessages].sort(
            (a, b) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          );
          return combined;
        });
        addDebugLog('info', `Loaded ${reversed.length} messages`, {
          hasNextPage: response.pageInfo.hasNextPage,
        });
      } catch (error) {
        addDebugLog('error', 'Failed to load history', { error });
      } finally {
        setLoadingHistory(false);
      }
    },
    [threadId, addDebugLog],
  );

  // Send message
  const sendMessage = useCallback(() => {
    if (!inputText.trim() || sending || !socketRef.current?.connected) {
      return;
    }

    const text = inputText.trim();
    setInputText('');
    setSending(true);

    const clientMessageId = crypto.randomUUID();
    const optimisticMessage: OptimisticMessage = {
      id: `optimistic-${clientMessageId}`,
      threadId,
      senderUserId: '', // Will be filled by server
      senderRole: 'patient', // Will be filled by server
      kind: 'text',
      text,
      clientMessageId,
      contextConsultationId: null,
      createdAt: new Date().toISOString(),
      optimistic: true,
      sending: true,
    };

    setMessages((prev) => [...prev, optimisticMessage]);

    socketRef.current.timeout(3000).emit(
      'chat:send',
      {
        threadId,
        clientMessageId,
        kind: 'text',
        text,
      },
      (
        err: Error | null,
        response?: {
          ok: boolean;
          data?: { message: ChatMessage };
          error?: { code: string; message: string };
        },
      ) => {
        setSending(false);
        setMessages((prev) => {
          // Remove optimistic message
          const filtered = prev.filter(
            (m) => !isOptimistic(m) || m.clientMessageId !== clientMessageId,
          );

          if (err || !response?.ok) {
            // Mark as failed
            const failed: OptimisticMessage = {
              ...optimisticMessage,
              sending: false,
              failed: true,
              errorCode: response?.error?.code || 'TIMEOUT',
            };
            addDebugLog('ack_error', 'Send ACK failed', {
              code: response?.error?.code || 'TIMEOUT',
              message: response?.error?.message || err?.message,
            });
            return [...filtered, failed];
          }

          // Replace with real message (if not already added by broadcast)
          const realMessage = response.data?.message;
          if (realMessage) {
            const exists = filtered.some((m) => m.id === realMessage.id);
            if (!exists) {
              addDebugLog('ack', 'Send ACK success', {
                messageId: realMessage.id,
              });
              return [...filtered, realMessage].sort(
                (a, b) =>
                  new Date(a.createdAt).getTime() -
                  new Date(b.createdAt).getTime(),
              );
            }
          }

          return filtered;
        });
      },
    );
  }, [inputText, sending, threadId, addDebugLog]);

  // Auto-connect on mount if enabled
  useEffect(() => {
    if (autoConnect) {
      connectSocket();
    }
    return () => {
      if (autoConnect) {
        disconnectSocket();
      }
    };
  }, [threadId, autoConnect, connectSocket, disconnectSocket]);

  // Auto-join when connected if enabled
  useEffect(() => {
    if (autoJoin && connected && !joined && socketRef.current?.connected) {
      joinThread();
    }
  }, [autoJoin, connected, joined, joinThread]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        border: '1px solid #ccc',
        borderRadius: '4px',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px',
          borderBottom: '1px solid #ccc',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ fontWeight: 'bold' }}>
            Thread: {threadId.substring(0, 8)}...
          </div>
          {otherUser && (
            <div style={{ fontSize: '0.9em', color: '#666' }}>
              {otherUser.displayName || otherUser.email}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={connectSocket}
            disabled={connected}
            style={{
              padding: '4px 8px',
              fontSize: '0.85em',
              backgroundColor: connected ? '#ccc' : '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: connected ? 'not-allowed' : 'pointer',
            }}
          >
            Connect WS
          </button>
          <button
            onClick={joinThread}
            disabled={!connected || joined}
            style={{
              padding: '4px 8px',
              fontSize: '0.85em',
              backgroundColor: joined ? '#ccc' : '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: joined || !connected ? 'not-allowed' : 'pointer',
            }}
          >
            Join
          </button>
          <span
            style={{
              padding: '4px 8px',
              fontSize: '0.85em',
              backgroundColor: connected ? '#4CAF50' : '#f44336',
              color: 'white',
              borderRadius: '4px',
            }}
          >
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Debug Logs */}
      <div
        style={{
          flex: '0 0 150px',
          overflowY: 'auto',
          borderBottom: '1px solid #ccc',
          padding: '8px',
          fontSize: '0.75em',
          fontFamily: 'monospace',
          backgroundColor: '#f5f5f5',
        }}
      >
        <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
          Debug Logs (last 30):
        </div>
        {debugLogs.map((log) => (
          <div
            key={log.id}
            style={{
              marginBottom: '2px',
              color:
                log.type === 'error' || log.type === 'ack_error'
                  ? '#f44336'
                  : log.type === 'ack'
                    ? '#4CAF50'
                    : '#333',
            }}
          >
            [{new Date(log.timestamp).toLocaleTimeString()}] {log.type}:{' '}
            {log.message}
            {log.data &&
            typeof log.data === 'object' &&
            Object.keys(log.data).length > 0 ? (
              <span style={{ color: '#666' }}>
                {' '}
                {JSON.stringify(log.data).substring(0, 100)}
              </span>
            ) : null}
          </div>
        ))}
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <button
            onClick={() => void loadHistory()}
            disabled={loadingHistory}
            style={{
              padding: '4px 8px',
              fontSize: '0.85em',
              backgroundColor: '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loadingHistory ? 'not-allowed' : 'pointer',
            }}
          >
            {loadingHistory ? 'Loading...' : 'Load History'}
          </button>
          {messagesPageInfo?.hasNextPage && (
            <button
              onClick={() =>
                void loadHistory(messagesPageInfo.endCursor || undefined)
              }
              disabled={loadingHistory}
              style={{
                padding: '4px 8px',
                fontSize: '0.85em',
                backgroundColor: '#FF9800',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: loadingHistory ? 'not-allowed' : 'pointer',
              }}
            >
              Load More
            </button>
          )}
        </div>

        {messages.map((message) => {
          const isOpt = isOptimistic(message);
          const displayName =
            message.sender?.displayName ||
            message.sender?.email ||
            message.senderUserId.substring(0, 8);

          return (
            <div
              key={message.id}
              style={{
                padding: '8px',
                backgroundColor: isOpt
                  ? message.failed
                    ? '#ffebee'
                    : '#e3f2fd'
                  : '#f5f5f5',
                borderRadius: '4px',
                border: isOpt && message.failed ? '1px solid #f44336' : 'none',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '4px',
                }}
              >
                <span style={{ fontWeight: 'bold' }}>{displayName}</span>
                <span style={{ fontSize: '0.85em', color: '#666' }}>
                  {new Date(message.createdAt).toLocaleTimeString()}
                </span>
              </div>
              <div>{message.text}</div>
              {message.contextConsultationId && (
                <div
                  style={{
                    marginTop: '4px',
                    fontSize: '0.75em',
                    color: '#2196F3',
                  }}
                >
                  Consultation: {message.contextConsultationId.substring(0, 8)}
                  ...
                </div>
              )}
              {isOpt && message.sending && (
                <div style={{ fontSize: '0.75em', color: '#666' }}>
                  Sending...
                </div>
              )}
              {isOpt && message.failed && (
                <div style={{ fontSize: '0.75em', color: '#f44336' }}>
                  Failed: {message.errorCode}
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div
        style={{
          padding: '12px',
          borderTop: '1px solid #ccc',
          display: 'flex',
          gap: '8px',
        }}
      >
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder="Type a message..."
          style={{
            flex: 1,
            padding: '8px',
            border: '1px solid #ccc',
            borderRadius: '4px',
          }}
          disabled={!joined || sending}
        />
        <button
          onClick={sendMessage}
          disabled={!joined || sending || !inputText.trim()}
          style={{
            padding: '8px 16px',
            backgroundColor: joined && !sending ? '#2196F3' : '#ccc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: joined && !sending ? 'pointer' : 'not-allowed',
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
