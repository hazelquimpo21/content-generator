import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // Path aliases for cleaner imports
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@styles': path.resolve(__dirname, './src/styles'),
      '@contexts': path.resolve(__dirname, './src/contexts'),
    },
  },

  // Development server configuration
  server: {
    port: 5173,
    // Proxy API requests to backend during development
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        // Increase timeout for large file uploads (e.g., audio transcription)
        timeout: 300000, // 5 minutes
        proxyTimeout: 300000,
        // Configure proxy for large uploads
        configure: (proxy) => {
          proxy.on('error', (err, req, res) => {
            console.error('Proxy error:', err.message);
          });
        },
      },
    },
  },

  // Build configuration
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
