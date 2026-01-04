/**
 * Centralized API endpoints
 * All endpoints are relative to /api/v1 base
 */

export const endpoints = {
  // Auth
  auth: {
    login: '/auth/login',
    register: '/auth/register',
    me: '/auth/me',
  },
  // Patient Identity
  patientIdentity: {
    get: '/patients/me/identity',
    patch: '/patients/me/identity',
  },
  // Doctor Profile
  doctorProfile: {
    get: '/doctors/me/profile',
    put: '/doctors/me/profile',
  },
  // Consultation Queue
  queue: {
    create: '/consultations/queue',
    list: '/consultations/queue',
    get: (queueItemId: string) => `/consultations/queue/${queueItemId}`,
    accept: (queueItemId: string) =>
      `/consultations/queue/${queueItemId}/accept`,
    reject: (queueItemId: string) =>
      `/consultations/queue/${queueItemId}/reject`,
    cancel: (queueItemId: string) =>
      `/consultations/queue/${queueItemId}/cancel`,
    payment: (queueItemId: string) =>
      `/consultations/queue/${queueItemId}/payment`,
    start: (queueItemId: string) => `/consultations/queue/${queueItemId}/start`,
  },
} as const;
