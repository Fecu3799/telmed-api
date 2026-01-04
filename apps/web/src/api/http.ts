function randomUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback para navegadores antiguos
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface ProblemDetails {
  type?: string;
  title?: string;
  status: number;
  detail: string;
  instance?: string;
  errors?: Record<string, string[]>;
}

export interface ApiError extends Error {
  problemDetails?: ProblemDetails;
  status: number;
}

const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1';

let currentTraceId: string | null = null;

export function getCurrentTraceId(): string | null {
  return currentTraceId;
}

export function setTraceId(traceId: string | null): void {
  currentTraceId = traceId;
}

async function parseProblemDetails(response: Response): Promise<ProblemDetails> {
  try {
    const data = await response.json();
    return {
      type: data.type,
      title: data.title,
      status: data.status || response.status,
      detail: data.detail || 'An error occurred',
      instance: data.instance,
      errors: data.errors,
    };
  } catch {
    return {
      status: response.status,
      detail: response.statusText || 'An error occurred',
    };
  }
}

export async function http<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const traceId = randomUUID();
  currentTraceId = traceId;

  const url = `${baseUrl}${endpoint}`;
  const token = getAccessToken();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'X-Trace-Id': traceId,
    ...options.headers,
  };

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const problemDetails = await parseProblemDetails(response);
    const error: ApiError = new Error(problemDetails.detail) as ApiError;
    error.problemDetails = problemDetails;
    error.status = response.status;
    throw error;
  }

  // Handle empty responses (e.g., 204 No Content)
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return undefined as T;
  }

  return response.json();
}

// Token management - dynamic getter (set by AuthContext)
// This allows the HTTP client to get the active token at request time, not from a cached closure
let getAccessTokenFn: (() => string | null) | null = null;

export function setAccessTokenGetter(fn: (() => string | null) | null): void {
  getAccessTokenFn = fn;
}

export function getAccessToken(): string | null {
  if (getAccessTokenFn) {
    return getAccessTokenFn();
  }
  return null;
}

