import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Bind to 127.0.0.1 rather than the default 'localhost'.
    // On Windows, 'localhost' can resolve to ::1 only, which leaves
    // http://127.0.0.1:5173 refusing connections in some browsers.
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // Proxy API calls to Express so the browser sees a single origin
    // in development - no CORS friction, no hardcoded host in the client.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
      // Uploaded images are served by Express at /uploads/<file>. Proxy them
      // too so the browser sees a single origin in development.
      '/uploads': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
