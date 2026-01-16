import { io, type Socket } from 'socket.io-client';
import { config } from '../config/env';

class NotificationsSocketClient {
  private socket: Socket | null = null;
  private token: string | null = null;

  connect(accessToken: string | null): void {
    if (this.socket && this.token !== accessToken) {
      this.disconnect();
    }

    if (!accessToken) {
      return;
    }

    if (this.socket?.connected && this.token === accessToken) {
      return;
    }

    const serverUrl = config.SOCKET_URL || window.location.origin;
    this.token = accessToken;
    this.socket = io(`${serverUrl}/notifications`, {
      path: '/socket.io',
      auth: { token: accessToken },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    if (config.DEBUG_SOCKET || import.meta.env.DEV) {
      this.socket.on('connect', () => {
        console.log('[Socket] Connected to /notifications namespace');
      });
      this.socket.on('disconnect', (reason) => {
        console.log('[Socket] Disconnected:', reason);
      });
      this.socket.on('connect_error', (error) => {
        console.error('[Socket] Connection error:', error);
      });
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.token = null;
    }
  }

  onAppointmentsChanged(handler: () => void): void {
    this.socket?.on('appointments.changed', handler);
  }

  offAppointmentsChanged(handler: () => void): void {
    this.socket?.off('appointments.changed', handler);
  }

  onEmergenciesChanged(handler: () => void): void {
    this.socket?.on('emergencies.changed', handler);
  }

  offEmergenciesChanged(handler: () => void): void {
    this.socket?.off('emergencies.changed', handler);
  }

  onConsultationsChanged(handler: () => void): void {
    this.socket?.on('consultations.changed', handler);
  }

  offConsultationsChanged(handler: () => void): void {
    this.socket?.off('consultations.changed', handler);
  }
}

export const notificationsSocket = new NotificationsSocketClient();
