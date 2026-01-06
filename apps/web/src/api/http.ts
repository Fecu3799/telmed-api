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

// Support both absolute URLs (http://...) and relative URLs (/api/v1)
const baseUrl =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1';

let currentTraceId: string | null = null;

export function getCurrentTraceId(): string | null {
  return currentTraceId;
}

export function setTraceId(traceId: string | null): void {
  currentTraceId = traceId;
}

async function parseProblemDetails(
  response: Response,
): Promise<ProblemDetails> {
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

  // Construct URL: endpoints always start with /
  // If baseUrl is relative (starts with /) or absolute (starts with http), concatenate directly
  // This works because endpoints always start with /, so /api/v1 + /auth/login = /api/v1/auth/login
  const url = `${baseUrl}${endpoint}`;
  const token = getAccessToken();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'X-Trace-Id': traceId,
    ...options.headers,
  };

  if (token) {
    // Normalize token: remove "Bearer " prefix if present to avoid duplication
    // Always add "Bearer " prefix exactly once
    const normalizedToken = token.startsWith('Bearer ')
      ? token.substring(7)
      : token;
    (headers as Record<string, string>)['Authorization'] =
      `Bearer ${normalizedToken}`;

    // Debug log (dev only): log if Authorization is being set (without full token)
    if (import.meta.env.DEV) {
      const tokenPreview =
        normalizedToken.length > 12
          ? `${normalizedToken.substring(0, 6)}...${normalizedToken.substring(normalizedToken.length - 6)}`
          : normalizedToken.substring(0, 6);
      console.log(
        `[http] Setting Authorization header for ${endpoint} (token: ${tokenPreview})`,
      );
    }
  } else {
    // Debug log (dev only): log if Authorization is NOT being set
    if (import.meta.env.DEV) {
      console.warn(
        `[http] No token available for ${endpoint} - Authorization header will NOT be sent`,
      );
    }
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
  if (
    response.status === 204 ||
    response.headers.get('content-length') === '0'
  ) {
    return undefined as T;
  }

  return response.json();
}

// Token management (will be set by AuthContext)
let accessToken: string | null = null;
let accessTokenGetter: (() => string | null) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function setAccessTokenGetter(
  getter: (() => string | null) | null,
): void {
  accessTokenGetter = getter;
}

export function getAccessToken(): string | null {
  if (accessTokenGetter) {
    return accessTokenGetter();
  }
  return accessToken;
}
