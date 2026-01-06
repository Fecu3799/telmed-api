import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    allowedHosts: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate LiveKit into its own chunk (it's large ~400KB)
          livekit: ['@livekit/components-react', 'livekit-client'],
          // Separate React Router into its own chunk
          'react-router': ['react-router-dom'],
        },
      },
    },
    // Increase chunk size warning limit to 600KB (LiveKit chunk will be large)
    chunkSizeWarningLimit: 600,
  },
});
