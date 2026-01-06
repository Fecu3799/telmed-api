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

    // Handle reconnection: re-subscribe to queue if needed
    this.socket.on('reconnect', () => {
      if (config.DEBUG_SOCKET) {
        console.log(
          '[Socket] Reconnected, re-subscribing to queue:',
          this.subscribedQueueItemId,
        );
      }
      if (this.subscribedQueueItemId && this.socket?.connected) {
        this.subscribeToQueue(this.subscribedQueueItemId);
      }
    });
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
    if (!this.socket?.connected) {
      if (callback) {
        callback({
          ok: false,
          error: { status: 500, detail: 'Socket not connected' },
        });
      }
      return;
    }

    this.subscribedQueueItemId = queueItemId;

    if (config.DEBUG_SOCKET) {
      console.log('[Socket] Emitting queue.subscribe:', { queueItemId });
    }

    this.socket.emit(
      'queue.subscribe',
      { queueItemId },
      (response: unknown) => {
        if (config.DEBUG_SOCKET) {
          console.log('[Socket] queue.subscribe ACK:', response);
        }
        if (callback) {
          callback(
            response as {
              ok: boolean;
              subscribed?: boolean;
              queueItemId?: string;
              error?: { status: number; detail: string };
            },
          );
        }
      },
    );
  }

  /**
   * Unsubscribe from queue item updates
   */
  unsubscribeFromQueue(): void {
    this.subscribedQueueItemId = null;
  }

  /**
   * Listen to consultation.started event (new event-driven contract)
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

    this.socket.on('consultation.started', (payload) => {
      if (config.DEBUG_SOCKET) {
        console.log('[Socket] Received consultation.started:', payload);
      }
      callback(payload);
    });
  }

  /**
   * Remove consultation.started listener
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
      this.socket.off('consultation.started', callback);
    } else {
      this.socket.off('consultation.started');
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
