import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';

const SERVICE_WORKER_FILE = 'sw.js';

function listFiles(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? listFiles(join(dir, entry.name), path) : [path];
  });
}

/**
 * Builds the service worker source for a finished build: the template with a precache list of
 * every built file and a cache name derived from their contents (and the template's), so any
 * change gives a new cache.
 */
export function buildServiceWorker(outDir: string, template: string): string {
  const files = listFiles(outDir)
    .filter((file) => file !== SERVICE_WORKER_FILE)
    .sort();

  const hash = createHash('sha256').update(template);
  for (const file of files) {
    hash.update(file);
    hash.update(readFileSync(join(outDir, file)));
  }

  const urls = files.map((file) => (file === 'index.html' ? '/' : `/${file}`));
  return [
    `const CACHE_NAME = ${JSON.stringify(`belt-tracker-${hash.digest('hex').slice(0, 12)}`)};`,
    `const PRECACHE_URLS = ${JSON.stringify(urls)};`,
    '',
    template,
  ].join('\n');
}

/** Vite plugin: writes `sw.js` into the build output once all other files are in place. */
export function serviceWorker(): Plugin {
  let root = process.cwd();
  let outDir = resolve(root, 'dist');
  return {
    name: 'belt-tracker-service-worker',
    apply: 'build',
    configResolved(config) {
      root = config.root;
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      // closeBundle also runs after a failed build, when there is nothing to cache.
      if (!existsSync(join(outDir, 'index.html'))) return;
      const template = readFileSync(resolve(root, 'pwa', 'sw.template.js'), 'utf8');
      writeFileSync(join(outDir, SERVICE_WORKER_FILE), buildServiceWorker(outDir, template));
    },
  };
}
