// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServiceWorker } from './service-worker';

const TEMPLATE = '// worker body';

function cacheName(source: string): string {
  return /const CACHE_NAME = "([^"]+)";/.exec(source)?.[1] ?? '';
}

describe('buildServiceWorker', () => {
  let outDir: string;

  beforeEach(() => {
    outDir = mkdtempSync(join(tmpdir(), 'belt-tracker-sw-'));
    mkdirSync(join(outDir, 'assets'));
    writeFileSync(join(outDir, 'index.html'), '<html></html>');
    writeFileSync(join(outDir, 'assets', 'index-abc.js'), 'console.log(1)');
    writeFileSync(join(outDir, 'icon-192.png'), 'png');
  });

  afterEach(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it('precaches every built file, with the page itself as "/"', () => {
    const source = buildServiceWorker(outDir, TEMPLATE);
    expect(source).toContain('const PRECACHE_URLS = ["/assets/index-abc.js","/icon-192.png","/"];');
    expect(source.endsWith(TEMPLATE)).toBe(true);
  });

  it('leaves a previous sw.js out of the list and the cache name', () => {
    const before = buildServiceWorker(outDir, TEMPLATE);
    writeFileSync(join(outDir, 'sw.js'), before);
    expect(buildServiceWorker(outDir, TEMPLATE)).toBe(before);
  });

  it('changes the cache name when any file changes', () => {
    const before = cacheName(buildServiceWorker(outDir, TEMPLATE));
    expect(before).toMatch(/^belt-tracker-[0-9a-f]{12}$/);
    writeFileSync(join(outDir, 'icon-192.png'), 'new png');
    expect(cacheName(buildServiceWorker(outDir, TEMPLATE))).not.toBe(before);
  });
});
