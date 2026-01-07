import { io, type Socket } from 'socket.io-client';
import { config } from '../config/env';

/**
 * Socket.IO client for consultations namespace
 * Handles connection, authentication, and event listeners
 */
class ConsultationSocketClient {
  private socket: Socket | null = null;
  private token: string | null = null;
  private subscribedQueueItemId: string | null = null;

  /**
   * Connect to consultations namespace with JWT token
   * @param accessToken - JWT access token (without "Bearer " prefix)
   */
  connect(accessToken: string | null): void {
    // Disconnect existing connection if token changed
    if (this.socket && this.token !== accessToken) {
      this.disconnect();
    }

    if (!accessToken) {
      return;
    }

    // Already connected with same token
    if (this.socket?.connected && this.token === accessToken) {
      return;
    }

    // Build server URL: use VITE_SOCKET_URL if set, otherwise use window.location.origin
    const serverUrl = config.SOCKET_URL || window.location.origin;

    this.token = accessToken;
    this.socket = io(`${serverUrl}/consultations`, {
      path: '/socket.io',
      auth: {
        token: accessToken,
      },
      transports: ['websocket'], // Prefer WebSocket, avoid long-polling
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    // Debug logging if enabled
    if (config.DEBUG_SOCKET) {
      this.socket.on('connect', () => {
        console.log('[Socket] Connected to /consultations namespace', {
          socketId: this.socket?.id,
          serverUrl,
        });
      });

      this.socket.on('disconnect', (reason) => {
        console.log('[Socket] Disconnected:', reason);
      });

      this.socket.on('connect_error', (error) => {
        console.error('[Socket] Connection error:', error);
      });
    } else if (import.meta.env.DEV) {
      // Minimal logging in dev mode
      this.socket.on('connect', () => {
        console.log('[Socket] Connected to /consultations namespace');
      });

      this.socket.on('disconnect', (reason) => {
        console.log('[Socket] Disconnected:', reason);
      });

      this.socket.on('connect_error', (error) => {
        console.error('[Socket] Connection error:', error);
      });
    }

    // Handle connection (first connect and reconnect): re-subscribe to queue if needed
    // This ensures subscription happens even if socket was still connecting when subscribeToQueue was called
    const handleConnect = () => {
      if (this.subscribedQueueItemId && this.socket?.connected) {
        if (config.DEBUG_SOCKET || import.meta.env.DEV) {
          console.log(
            '[Socket] Connected, auto-subscribing to queue:',
            this.subscribedQueueItemId,
          );
        }
        // Re-subscribe without callback to avoid duplicate logs
        this.subscribeToQueue(this.subscribedQueueItemId);
      }
    };

    // Listen to both 'connect' (first connection) and 'reconnect' (after disconnection)
    this.socket.on('connect', handleConnect);
    this.socket.on('reconnect', handleConnect);
  }

  /**
   * Disconnect from socket
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.token = null;
      this.subscribedQueueItemId = null;
    }
  }

  /**
   * Join a consultation room
   * @param consultationId - The consultation ID
   * @param callback - Optional callback for ACK response
   */
  joinConsultation(
    consultationId: string,
    callback?: (response: {
      ok: boolean;
      serverTime?: string;
      consultationStatus?: string;
      error?: { status: number; detail: string };
    }) => void,
  ): void {
    if (!this.socket?.connected) {
      if (callback) {
        callback({
          ok: false,
          error: { status: 500, detail: 'Socket not connected' },
        });
      }
      return;
    }

    this.socket.emit(
      'consultation.join',
      { consultationId },
      (response: unknown) => {
        if (callback) {
          callback(
            response as {
              ok: boolean;
              serverTime?: string;
              consultationStatus?: string;
              error?: { status: number; detail: string };
            },
          );
        }
      },
    );
  }

  /**
   * Subscribe to queue item updates (patient waiting for doctor to start)
   * This is "eventually consistent": if socket is not connected yet, the subscription
   * will be attempted automatically when the socket connects.
   * @param queueItemId - The queue item ID to subscribe to
   * @param callback - Optional callback for ACK response
   */
  subscribeToQueue(
    queueItemId: string,
    callback?: (response: {
      ok: boolean;
      subscribed?: boolean;
      queueItemId?: string;
      error?: { status: number; detail: string };
    }) => void,
  ): void {
    // Always persist the subscription intent, even if not connected yet
    // This ensures the subscription happens when the socket connects
    this.subscribedQueueItemId = queueItemId;

    if (!this.socket?.connected) {
      // Socket not connected yet: subscription will happen automatically on connect
      if (config.DEBUG_SOCKET || import.meta.env.DEV) {
        console.log(
          '[Socket] Will subscribe to queue on connect:',
          queueItemId,
        );
      }
      // Don't call callback with error - subscription is deferred, not failed
      return;
    }

    // Socket is connected: emit subscription immediately
    if (config.DEBUG_SOCKET || import.meta.env.DEV) {
      console.log('[Socket] Emitting queue:subscribe:', { queueItemId });
    }

    this.socket.emit(
      'queue:subscribe',
      { queueItemId },
      (response: unknown) => {
        const ackResponse = response as {
          ok: boolean;
          subscribed?: boolean;
          queueItemId?: string;
          error?: { status: number; detail: string };
        };

        if (config.DEBUG_SOCKET || import.meta.env.DEV) {
          if (ackResponse.ok) {
            console.log('[Socket] queue:subscribe ACK success:', ackResponse);
          } else {
            console.error('[Socket] queue:subscribe ACK failed:', ackResponse);
          }
        }

        if (callback) {
          callback(ackResponse);
        }
      },
    );
  }

  /**
   * Unsubscribe from queue item updates
   * @param queueItemId - Optional queue item ID to unsubscribe from (for safety: only unsubscribe if matches current)
   */
  unsubscribeFromQueue(queueItemId?: string): void {
    // Only unsubscribe if queueItemId matches (or if not provided, always unsubscribe)
    if (!queueItemId || this.subscribedQueueItemId === queueItemId) {
      const oldQueueItemId = this.subscribedQueueItemId;
      this.subscribedQueueItemId = null;

      // Best-effort: emit unsubscribe event to server (even if backend doesn't handle it yet)
      if (oldQueueItemId && this.socket?.connected) {
        if (config.DEBUG_SOCKET || import.meta.env.DEV) {
          console.log('[Socket] Emitting queue:unsubscribe:', {
            queueItemId: oldQueueItemId,
          });
        }
        // Emit without callback - best-effort, backend may not support it yet
        this.socket.emit('queue:unsubscribe', { queueItemId: oldQueueItemId });
      }
    }
  }

  /**
   * Listen to consultation:started event (new event-driven contract)
   * @param callback - Callback when consultation starts
   */
  onConsultationStarted(
    callback: (payload: {
      queueItemId: string;
      consultationId: string;
      roomName: string;
      livekitUrl: string;
      startedAt: string;
    }) => void,
  ): void {
    if (!this.socket) {
      return;
    }

    this.socket.on('consultation:started', (payload) => {
      if (config.DEBUG_SOCKET || import.meta.env.DEV) {
        console.log('[Socket] Received consultation:started:', payload);
      }
      callback(payload);
    });
  }

  /**
   * Remove consultation:started listener
   */
  offConsultationStarted(
    callback?: (payload: {
      queueItemId: string;
      consultationId: string;
      roomName: string;
      livekitUrl: string;
      startedAt: string;
    }) => void,
  ): void {
    if (!this.socket) {
      return;
    }

    if (callback) {
      this.socket.off('consultation:started', callback);
    } else {
      this.socket.off('consultation:started');
    }
  }

  /**
   * Check if socket is connected
   */
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}

// Singleton instance
export const consultationSocket = new ConsultationSocketClient();
