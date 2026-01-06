/**
 * Environment configuration
 * All environment variables should be prefixed with VITE_ to be accessible in the browser
 */

export const config = {
  /**
   * Base URL for the API backend
   * Default: http://localhost:3000/api/v1
   */
  API_BASE_URL:
    import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1',

  /**
   * LiveKit server URL (WebSocket URL, e.g., wss://your-project.livekit.cloud)
   * Used as fallback if:
   * - Backend doesn't return livekitUrl in the token response, OR
   * - Backend returns an invalid URL (e.g., default livekit.dev)
   * Default: undefined (will use the URL from backend response if valid)
   */
  LIVEKIT_URL: import.meta.env.VITE_LIVEKIT_URL || undefined,

  /**
   * Socket.IO server URL (optional, defaults to window.location.origin)
   * If not set, uses same origin as the page
   */
  SOCKET_URL: import.meta.env.VITE_SOCKET_URL || undefined,

  /**
   * Debug Socket.IO connections (logs all events)
   * Set to "true" to enable debug logging
   */
  DEBUG_SOCKET: import.meta.env.VITE_DEBUG_SOCKET === 'true',
} as const;
