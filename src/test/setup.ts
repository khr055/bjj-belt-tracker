import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  // Build-tooling tests run under Node, where there is no page to reset.
  if (typeof window === 'undefined') return;
  cleanup();
  window.localStorage.clear();
});
