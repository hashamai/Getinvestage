import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Local dev convenience; in production set VITE_API_URL instead.
      '/api': 'http://localhost:8000',
    },
  },
});
