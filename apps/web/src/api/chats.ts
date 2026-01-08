import { http } from './http';
import { endpoints } from './endpoints';

export interface ChatThread {
  id: string;
  doctorUserId: string;
  patientUserId: string;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
  doctor?: {
    id: string;
    email: string;
    displayName: string | null;
  };
  patient?: {
    id: string;
    email: string;
    displayName: string | null;
  };
  policy?: {
    id: string;
    threadId: string;
    patientCanMessage: boolean;
    dailyLimit: number | null;
    burstLimit: number | null;
    burstWindowSeconds: number | null;
    requireRecentConsultation: boolean;
    recentConsultationWindowHours: number | null;
    closedByDoctor: boolean;
  };
}

export interface ChatMessage {
  id: string;
  threadId: string;
  senderUserId: string;
  senderRole: 'doctor' | 'patient';
  kind: 'text';
  text: string;
  clientMessageId: string | null;
  contextConsultationId: string | null;
  createdAt: string;
  sender?: {
    id: string;
    email: string;
    displayName: string | null;
  };
}

export interface MessagesResponse {
  items: ChatMessage[];
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
  };
}

export interface UpdatePolicyRequest {
  patientCanMessage?: boolean;
  dailyLimit?: number;
  burstLimit?: number;
  burstWindowSeconds?: number;
  requireRecentConsultation?: boolean;
  recentConsultationWindowHours?: number;
  closedByDoctor?: boolean;
}

/**
 * List all threads for the current user
 */
export async function listThreads(): Promise<ChatThread[]> {
  return http<ChatThread[]>(endpoints.chats.threads);
}

/**
 * Get or create a thread with another user
 */
export async function getOrCreateThread(
  otherUserId: string,
): Promise<ChatThread> {
  return http<ChatThread>(endpoints.chats.threadWith(otherUserId));
}

/**
 * Get messages for a thread with cursor pagination
 */
export async function getThreadMessages(
  threadId: string,
  options?: {
    cursor?: string;
    limit?: number;
  },
): Promise<MessagesResponse> {
  const params = new URLSearchParams();
  if (options?.cursor) {
    params.append('cursor', options.cursor);
  }
  if (options?.limit) {
    params.append('limit', options.limit.toString());
  }

  const queryString = params.toString();
  const url = queryString
    ? `${endpoints.chats.threadMessages(threadId)}?${queryString}`
    : endpoints.chats.threadMessages(threadId);

  return http<MessagesResponse>(url);
}

/**
 * Update thread policy (doctor only)
 */
export async function updateThreadPolicy(
  threadId: string,
  policy: UpdatePolicyRequest,
): Promise<ChatThread> {
  return http<ChatThread>(endpoints.chats.threadPolicy(threadId), {
    method: 'PATCH',
    body: JSON.stringify(policy),
  });
}
