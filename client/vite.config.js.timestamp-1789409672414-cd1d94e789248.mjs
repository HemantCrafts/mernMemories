// vite.config.js
import { defineConfig } from "file:///C:/Users/dkohl/workbuddy-ai/social%20media%20App/client/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/dkohl/workbuddy-ai/social%20media%20App/client/node_modules/@vitejs/plugin-react/dist/index.js";
var vite_config_default = defineConfig({
  plugins: [react()],
  server: {
    // Bind to 127.0.0.1 rather than the default 'localhost'.
    // On Windows, 'localhost' can resolve to ::1 only, which leaves
    // http://127.0.0.1:5173 refusing connections in some browsers.
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    // Proxy API calls to Express so the browser sees a single origin
    // in development - no CORS friction, no hardcoded host in the client.
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true
      },
      // Uploaded images are served by Express at /uploads/<file>. Proxy them
      // too so the browser sees a single origin in development.
      "/uploads": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: "dist",
    sourcemap: false
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxka29obFxcXFx3b3JrYnVkZHktYWlcXFxcc29jaWFsIG1lZGlhIEFwcFxcXFxjbGllbnRcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkM6XFxcXFVzZXJzXFxcXGRrb2hsXFxcXHdvcmtidWRkeS1haVxcXFxzb2NpYWwgbWVkaWEgQXBwXFxcXGNsaWVudFxcXFx2aXRlLmNvbmZpZy5qc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vQzovVXNlcnMvZGtvaGwvd29ya2J1ZGR5LWFpL3NvY2lhbCUyMG1lZGlhJTIwQXBwL2NsaWVudC92aXRlLmNvbmZpZy5qc1wiO2ltcG9ydCB7IGRlZmluZUNvbmZpZyB9IGZyb20gJ3ZpdGUnO1xuaW1wb3J0IHJlYWN0IGZyb20gJ0B2aXRlanMvcGx1Z2luLXJlYWN0JztcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcGx1Z2luczogW3JlYWN0KCldLFxuICBzZXJ2ZXI6IHtcbiAgICAvLyBCaW5kIHRvIDEyNy4wLjAuMSByYXRoZXIgdGhhbiB0aGUgZGVmYXVsdCAnbG9jYWxob3N0Jy5cbiAgICAvLyBPbiBXaW5kb3dzLCAnbG9jYWxob3N0JyBjYW4gcmVzb2x2ZSB0byA6OjEgb25seSwgd2hpY2ggbGVhdmVzXG4gICAgLy8gaHR0cDovLzEyNy4wLjAuMTo1MTczIHJlZnVzaW5nIGNvbm5lY3Rpb25zIGluIHNvbWUgYnJvd3NlcnMuXG4gICAgaG9zdDogJzEyNy4wLjAuMScsXG4gICAgcG9ydDogNTE3MyxcbiAgICBzdHJpY3RQb3J0OiB0cnVlLFxuICAgIC8vIFByb3h5IEFQSSBjYWxscyB0byBFeHByZXNzIHNvIHRoZSBicm93c2VyIHNlZXMgYSBzaW5nbGUgb3JpZ2luXG4gICAgLy8gaW4gZGV2ZWxvcG1lbnQgLSBubyBDT1JTIGZyaWN0aW9uLCBubyBoYXJkY29kZWQgaG9zdCBpbiB0aGUgY2xpZW50LlxuICAgIHByb3h5OiB7XG4gICAgICAnL2FwaSc6IHtcbiAgICAgICAgdGFyZ2V0OiAnaHR0cDovLzEyNy4wLjAuMTo1MDAwJyxcbiAgICAgICAgY2hhbmdlT3JpZ2luOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIC8vIFVwbG9hZGVkIGltYWdlcyBhcmUgc2VydmVkIGJ5IEV4cHJlc3MgYXQgL3VwbG9hZHMvPGZpbGU+LiBQcm94eSB0aGVtXG4gICAgICAvLyB0b28gc28gdGhlIGJyb3dzZXIgc2VlcyBhIHNpbmdsZSBvcmlnaW4gaW4gZGV2ZWxvcG1lbnQuXG4gICAgICAnL3VwbG9hZHMnOiB7XG4gICAgICAgIHRhcmdldDogJ2h0dHA6Ly8xMjcuMC4wLjE6NTAwMCcsXG4gICAgICAgIGNoYW5nZU9yaWdpbjogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSxcbiAgfSxcbiAgYnVpbGQ6IHtcbiAgICBvdXREaXI6ICdkaXN0JyxcbiAgICBzb3VyY2VtYXA6IGZhbHNlLFxuICB9LFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQTJWLFNBQVMsb0JBQW9CO0FBQ3hYLE9BQU8sV0FBVztBQUVsQixJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixTQUFTLENBQUMsTUFBTSxDQUFDO0FBQUEsRUFDakIsUUFBUTtBQUFBO0FBQUE7QUFBQTtBQUFBLElBSU4sTUFBTTtBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sWUFBWTtBQUFBO0FBQUE7QUFBQSxJQUdaLE9BQU87QUFBQSxNQUNMLFFBQVE7QUFBQSxRQUNOLFFBQVE7QUFBQSxRQUNSLGNBQWM7QUFBQSxNQUNoQjtBQUFBO0FBQUE7QUFBQSxNQUdBLFlBQVk7QUFBQSxRQUNWLFFBQVE7QUFBQSxRQUNSLGNBQWM7QUFBQSxNQUNoQjtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQUEsRUFDQSxPQUFPO0FBQUEsSUFDTCxRQUFRO0FBQUEsSUFDUixXQUFXO0FBQUEsRUFDYjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
