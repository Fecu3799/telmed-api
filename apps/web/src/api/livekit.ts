import { http } from './http';
import { endpoints } from './endpoints';
import { config } from '../config/env';

export interface LiveKitTokenResponse {
  token: string;
  roomName: string;
  livekitUrl: string;
}

export interface LiveKitTokenRequest {
  as: 'doctor' | 'patient';
}

/**
 * Validate LiveKit URL - reject incorrect defaults like livekit.dev
 * @param url - The LiveKit URL to validate
 * @returns true if the URL is valid, false otherwise
 */
function isValidLiveKitUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  // Reject incorrect defaults like livekit.dev (should be livekit.cloud or custom domain)
  if (url.includes('livekit.dev')) {
    return false;
  }
  // Must be a valid WebSocket URL (wss:// or ws://)
  return url.startsWith('wss://') || url.startsWith('ws://');
}

/**
 * Get LiveKit token for a consultation
 * @param consultationId - The consultation ID
 * @param asRole - The role to join as ('doctor' or 'patient')
 * @returns Promise with token, roomName, and livekitUrl
 * @throws ApiError with ProblemDetails if the request fails
 */
export async function getLivekitToken(
  consultationId: string,
  asRole: 'doctor' | 'patient',
): Promise<LiveKitTokenResponse> {
  // Note: The backend determines the role from the JWT token, but we send 'as' in the body
  // for clarity and potential future use
  const response = await http<LiveKitTokenResponse>(
    endpoints.consultations.livekitToken(consultationId),
    {
      method: 'POST',
      body: JSON.stringify({ as: asRole }),
    },
  );

  // Use livekitUrl from response (preferred), but validate it
  // If invalid or missing, fallback to env config (VITE_LIVEKIT_URL)
  let livekitUrl: string | undefined;

  if (isValidLiveKitUrl(response.livekitUrl)) {
    livekitUrl = response.livekitUrl;
    if (import.meta.env.DEV) {
      console.log(
        '[LiveKit] Using livekitUrl from backend response:',
        livekitUrl,
      );
    }
  } else {
    // Backend returned invalid URL (e.g., default livekit.dev), use env fallback
    if (import.meta.env.DEV && response.livekitUrl) {
      console.warn(
        `[LiveKit] Backend returned invalid livekitUrl: ${response.livekitUrl}, using VITE_LIVEKIT_URL fallback`,
      );
    }
    livekitUrl = config.LIVEKIT_URL;
  }

  // Final validation: ensure we have a valid URL
  if (!livekitUrl || !isValidLiveKitUrl(livekitUrl)) {
    throw new Error(
      'LiveKit URL not provided or invalid. Backend returned invalid URL and VITE_LIVEKIT_URL is not set or invalid. Please configure VITE_LIVEKIT_URL with a valid LiveKit Cloud URL (e.g., wss://your-project.livekit.cloud).',
    );
  }

  return {
    ...response,
    livekitUrl,
  };
}
