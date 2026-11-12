// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { maxStripes } from './rank';
import { DEFAULT_ICON_LINKS, rankIconLinks } from './rankIcons';
import { BELTS, type Rank } from './types';

const PUBLIC_DIR = resolve(__dirname, '..', '..', 'public');

const ALL_RANKS: Rank[] = BELTS.flatMap((belt) =>
  Array.from({ length: maxStripes(belt) + 1 }, (_, stripes) => ({ belt, stripes })),
);

function publicFile(path: string): string {
  return resolve(PUBLIC_DIR, path.replace(/^\//, ''));
}

/** The width and height recorded in a PNG file's header. */
function pngSize(path: string): [number, number] {
  const file = readFileSync(publicFile(path));
  expect(file.subarray(1, 4).toString('ascii')).toBe('PNG');
  return [file.readUInt32BE(16), file.readUInt32BE(20)];
}

function readManifest(path: string) {
  return JSON.parse(readFileSync(publicFile(path), 'utf8'));
}

describe('rankIconLinks', () => {
  it('names the files for a rank', () => {
    expect(rankIconLinks({ belt: 'blue', stripes: 2 })).toEqual({
      manifest: '/ranks/blue-2.webmanifest',
      appleTouchIcon: '/ranks/blue-2-180.png',
      favicon: '/ranks/blue-2.svg',
    });
    expect(rankIconLinks({ belt: 'black', stripes: 6 })).toEqual({
      manifest: '/ranks/black-6.webmanifest',
      appleTouchIcon: '/ranks/black-6-180.png',
      favicon: '/ranks/black-6.svg',
    });
  });

  it('gives the default icons when no rank is set', () => {
    expect(rankIconLinks(null)).toEqual({
      manifest: '/manifest.webmanifest',
      appleTouchIcon: '/apple-touch-icon.png',
      favicon: '/favicon.svg',
    });
  });

  it('gives the default icons for a rank that does not exist', () => {
    expect(rankIconLinks({ belt: 'blue', stripes: 5 })).toBe(DEFAULT_ICON_LINKS);
    expect(rankIconLinks({ belt: 'black', stripes: 7 })).toBe(DEFAULT_ICON_LINKS);
    expect(rankIconLinks({ belt: 'white', stripes: -1 })).toBe(DEFAULT_ICON_LINKS);
    expect(rankIconLinks({ belt: 'white', stripes: 1.5 })).toBe(DEFAULT_ICON_LINKS);
    expect(rankIconLinks({ belt: '../x', stripes: 0 } as unknown as Rank)).toBe(DEFAULT_ICON_LINKS);
  });

  it('gives every rank its own files', () => {
    expect(ALL_RANKS).toHaveLength(27);
    for (const key of ['manifest', 'appleTouchIcon', 'favicon'] as const) {
      expect(new Set(ALL_RANKS.map((rank) => rankIconLinks(rank)[key])).size).toBe(27);
    }
  });
});

// These read the files `npm run icons` wrote into public/, so a rank whose files were not
// generated, or a manifest that drifted from the default one, fails the build.
describe('the generated icon files', () => {
  const defaultManifest = readManifest(DEFAULT_ICON_LINKS.manifest);

  it('has an explicit id on the default manifest, the one browsers derived before', () => {
    // Without an id, browsers use the start URL. Stating the same value keeps existing installs.
    expect(defaultManifest.id).toBe(defaultManifest.start_url);
    expect(defaultManifest.start_url).toBe('/');
  });

  it.each(ALL_RANKS)('exist for $belt $stripes', (rank) => {
    const links = rankIconLinks(rank);
    expect(existsSync(publicFile(links.favicon))).toBe(true);
    expect(pngSize(links.appleTouchIcon)).toEqual([180, 180]);

    // The same app as the default manifest in every respect except where its icons are.
    const manifest = readManifest(links.manifest);
    const withoutSrc = (icon: Record<string, string>) => ({ ...icon, src: '' });
    expect({ ...manifest, icons: manifest.icons.map(withoutSrc) }).toEqual({
      ...defaultManifest,
      icons: defaultManifest.icons.map(withoutSrc),
    });

    for (const icon of manifest.icons as Record<string, string>[]) {
      expect(icon.src).toMatch(new RegExp(`^/ranks/${rank.belt}-${rank.stripes}-\\d+\\.png$`));
      const size = Number(icon.sizes.split('x')[0]);
      expect(pngSize(icon.src)).toEqual([size, size]);
    }
  });
});
