import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      // Same-origin proxy to the FastAPI backend (real quotes + Yahoo candles).
      '/api': 'http://localhost:8000',
    },
  },
});
