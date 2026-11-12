import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { serviceWorker } from './pwa/service-worker';

export default defineConfig({
  plugins: [react(), serviceWorker()],
  test: {
    environment: 'jsdom',
    // Only this checkout's tests: agent worktrees under .claude/ hold copies of the whole repo.
    include: ['{src,pwa}/**/*.test.{ts,tsx}'],
    setupFiles: './src/test/setup.ts',
  },
});
