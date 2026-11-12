import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/** A plain in-memory stand-in for the browser's localStorage. */
class MemoryStorage implements Storage {
  [name: string]: unknown;
  readonly #items = new Map<string, string>();

  get length(): number {
    return this.#items.size;
  }

  clear(): void {
    this.#items.clear();
  }

  getItem(key: string): string | null {
    return this.#items.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.#items.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.#items.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#items.set(String(key), String(value));
  }
}

// Build-tooling tests run under Node, where there is no page.
const hasPage = typeof window !== 'undefined';

if (hasPage) {
  // Newer Node versions ship their own global `localStorage`, which is unusable without a
  // backing file and shadows the one the test environment provides. Installing our own keeps
  // the tests identical on every Node version.
  const storage = new MemoryStorage();
  for (const target of new Set([globalThis, window])) {
    Object.defineProperty(target, 'localStorage', {
      value: storage,
      writable: true,
      configurable: true,
    });
  }
}

afterEach(() => {
  if (!hasPage) return;
  cleanup();
  window.localStorage.clear();
});
