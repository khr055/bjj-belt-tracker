import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { serviceWorker } from './pwa/service-worker';

export default defineConfig({
  plugins: [react(), serviceWorker()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
});
