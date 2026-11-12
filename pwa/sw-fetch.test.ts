// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Runs the worker's own source against stand-ins for the browser, so the fetch handler is tested
 * as it ships and not as a copy of its logic.
 */
function startWorker(respond: (url: string) => { status: number }) {
  const handlers: Record<string, (event: unknown) => void> = {};
  const stored = new Map<string, unknown>();
  const cache = {
    match: async (key: string | { url: string }) =>
      stored.get(typeof key === 'string' ? key : new URL(key.url).pathname),
    put: async (request: { url: string }, response: unknown) => {
      const { pathname, search } = new URL(request.url);
      stored.set(pathname + search, response);
    },
    addAll: async () => undefined,
  };
  const scope = {
    self: {
      location: { origin: 'https://app.example' },
      addEventListener: (type: string, handler: (event: unknown) => void) => {
        handlers[type] = handler;
      },
    },
    caches: { open: async () => cache, keys: async () => [], delete: async () => true },
    fetch: async (request: { url: string }) => {
      const { status } = respond(request.url);
      const response = { status, ok: status >= 200 && status < 300, clone: () => response };
      return response;
    },
    URL,
  };
  const source = readFileSync(join(__dirname, 'sw.template.js'), 'utf8');
  new Function('self', 'caches', 'fetch', 'URL', 'CACHE_NAME', 'PRECACHE_URLS', source)(
    scope.self,
    scope.caches,
    scope.fetch,
    scope.URL,
    'belt-tracker-test',
    ['/'],
  );

  /** Fetches through the worker and waits for anything it is still storing. */
  async function get(path: string, init: { method?: string; mode?: string } = {}) {
    const pending: Promise<unknown>[] = [];
    let answer: Promise<unknown> | undefined;
    handlers.fetch({
      request: { url: `https://app.example${path}`, method: init.method ?? 'GET', mode: init.mode ?? 'no-cors' },
      respondWith: (response: Promise<unknown>) => {
        answer = response;
      },
      waitUntil: (work: Promise<unknown>) => pending.push(work),
    });
    const response = await answer;
    await Promise.all(pending);
    return response;
  }
  return { get, stored };
}

describe('the service worker keeping rank files', () => {
  it('keeps a rank icon and manifest the first time each is fetched', async () => {
    const { get, stored } = startWorker(() => ({ status: 200 }));
    await get('/ranks/blue-2-180.png');
    await get('/ranks/blue-2.webmanifest');
    await get('/ranks/black-6-512.png');
    expect([...stored.keys()].sort()).toEqual([
      '/ranks/black-6-512.png',
      '/ranks/blue-2-180.png',
      '/ranks/blue-2.webmanifest',
    ]);
  });

  it('keeps nothing that is not a rank file, has a query string, or did not come back whole', async () => {
    const { get, stored } = startWorker((url) => ({
      status: url.includes('partial') ? 206 : url.includes('missing') ? 404 : 200,
    }));
    await get('/ranks/blue-2-180.png?x=1');
    await get('/ranks/nope.png');
    await get('/ranks/blue-2.html');
    await get('/ranks/deeper/blue-2-180.png');
    await get('/assets/index-abc.js');
    await get('/ranks/blue-2-180.png', { method: 'POST' });
    await get('/ranks/blue-2-180.png', { mode: 'navigate' });
    expect(stored.size).toBe(0);
  });

  it('does not keep an error or a partial response for a real rank file', async () => {
    const missing = startWorker(() => ({ status: 404 }));
    await missing.get('/ranks/blue-2-180.png');
    expect(missing.stored.size).toBe(0);

    const partial = startWorker(() => ({ status: 206 }));
    await partial.get('/ranks/blue-2-180.png');
    expect(partial.stored.size).toBe(0);
  });
});
