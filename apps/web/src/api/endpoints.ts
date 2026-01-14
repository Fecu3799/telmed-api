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
  // Consultations
  consultations: {
    get: (consultationId: string) => `/consultations/${consultationId}`,
    livekitToken: (consultationId: string) =>
      `/consultations/${consultationId}/livekit-token`,
  },
  // Chats
  chats: {
    threads: '/chats/threads',
    threadWith: (otherUserId: string) => `/chats/threads/with/${otherUserId}`,
    threadMessages: (threadId: string) => `/chats/threads/${threadId}/messages`,
    threadPolicy: (threadId: string) => `/chats/threads/${threadId}/policy`,
  },
  // Doctor Search
  doctorSearch: {
    search: '/doctors/search',
  },
  // Specialties
  specialties: {
    list: '/specialties',
  },
  // Patient Files
  patientFiles: {
    // Patient routes (self)
    list: '/patients/me/files',
    prepare: '/patients/me/files/prepare',
    confirm: (patientFileId: string) =>
      `/patients/me/files/${patientFileId}/confirm`,
    get: (patientFileId: string) => `/patients/me/files/${patientFileId}`,
    download: (patientFileId: string) =>
      `/patients/me/files/${patientFileId}/download`,
    delete: (patientFileId: string) => `/patients/me/files/${patientFileId}`,
    // Doctor routes (on behalf of patient)
    listForPatient: (patientId: string) => `/patients/${patientId}/files`,
    prepareForPatient: (patientId: string) =>
      `/patients/${patientId}/files/prepare`,
    confirmForPatient: (patientId: string, patientFileId: string) =>
      `/patients/${patientId}/files/${patientFileId}/confirm`,
    getForPatient: (patientId: string, patientFileId: string) =>
      `/patients/${patientId}/files/${patientFileId}`,
    downloadForPatient: (patientId: string, patientFileId: string) =>
      `/patients/${patientId}/files/${patientFileId}/download`,
    deleteForPatient: (patientId: string, patientFileId: string) =>
      `/patients/${patientId}/files/${patientFileId}`,
  },
} as const;
