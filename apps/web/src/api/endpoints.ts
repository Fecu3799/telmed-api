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
    location: '/doctors/me/location',
  },
  // Doctor Patients
  doctorPatients: {
    list: '/doctors/me/patients',
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
    close: (consultationId: string) => `/consultations/${consultationId}/close`,
    clinicalEpisode: (consultationId: string) =>
      `/consultations/${consultationId}/clinical-episode`,
    active: '/consultations/me/active',
    historyPatient: '/patients/me/consultations',
    historyDoctorPatient: (patientUserId: string) =>
      `/doctor-patients/${patientUserId}/consultations`,
  },
  emergencies: {
    doctor: '/doctors/me/emergencies',
    patient: '/patients/me/emergencies',
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
  geo: {
    online: '/doctors/me/geo/online',
    ping: '/doctors/me/geo/ping',
    offline: '/doctors/me/geo/offline',
    status: '/doctors/me/geo/status',
    nearby: '/geo/doctors/nearby',
    emergencies: '/geo/emergencies',
  },
  // Specialties
  specialties: {
    list: '/specialties',
  },
  // Doctor Availability (public)
  doctorAvailability: {
    get: (doctorUserId: string) => `/doctors/${doctorUserId}/availability`,
  },
  // Availability (doctor management)
  availability: {
    listRules: '/doctors/me/availability-rules',
    updateRules: '/doctors/me/availability-rules',
    listExceptions: '/doctors/me/availability-exceptions',
    createException: '/doctors/me/availability-exceptions',
    deleteException: (id: string) =>
      `/doctors/me/availability-exceptions/${id}`,
  },
  // Appointments
  appointments: {
    create: '/appointments',
    listPatient: '/patients/me/appointments',
    listDoctor: '/doctors/me/appointments',
    pay: (appointmentId: string) => `/appointments/${appointmentId}/pay`,
    cancel: (appointmentId: string) => `/appointments/${appointmentId}/cancel`,
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
