import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { maxStripes } from '../domain/rank';
import { DEFAULT_ICON_LINKS, rankIconLinks, type IconLinks } from '../domain/rankIcons';
import { BELTS, type Rank } from '../domain/types';
import { STORAGE_KEY } from './storage';
import { applyRankIcons, useRankIcons } from './useRankIcons';

const INDEX_HTML = readFileSync(resolve(__dirname, '..', '..', 'index.html'), 'utf8');

/** The `<link>` elements exactly as `index.html` declares them. */
function addLinks(): void {
  for (const tag of INDEX_HTML.match(/<link [^>]*>/g) ?? []) {
    document.head.insertAdjacentHTML('beforeend', tag);
  }
}

function currentLinks(): IconLinks {
  const href = (rel: string) => document.head.querySelector(`link[rel="${rel}"]`)?.getAttribute('href') ?? '';
  return { manifest: href('manifest'), appleTouchIcon: href('apple-touch-icon'), favicon: href('icon') };
}

beforeEach(addLinks);

afterEach(() => {
  document.head.innerHTML = '';
});

describe('index.html', () => {
  it('starts with the default icons', () => {
    expect(currentLinks()).toEqual(DEFAULT_ICON_LINKS);
  });
});

describe('applyRankIcons', () => {
  it('points the manifest, home-screen icon and tab icon at the files for the rank', () => {
    applyRankIcons({ belt: 'purple', stripes: 3 });
    expect(currentLinks()).toEqual({
      manifest: '/ranks/purple-3.webmanifest',
      appleTouchIcon: '/ranks/purple-3-180.png',
      favicon: '/ranks/purple-3.svg',
    });
  });

  it('goes back to the defaults when there is no rank', () => {
    applyRankIcons({ belt: 'purple', stripes: 3 });
    applyRankIcons(null);
    expect(currentLinks()).toEqual(DEFAULT_ICON_LINKS);
  });

  it('does nothing on a page without the links', () => {
    document.head.innerHTML = '';
    expect(() => applyRankIcons({ belt: 'blue', stripes: 0 })).not.toThrow();
    expect(document.head.children).toHaveLength(0);
  });
});

describe('useRankIcons', () => {
  it('follows the rank as it changes', () => {
    const { rerender } = renderHook(({ rank }: { rank: Rank | null }) => useRankIcons(rank), {
      initialProps: { rank: { belt: 'white', stripes: 4 } as Rank | null },
    });
    expect(currentLinks()).toEqual(rankIconLinks({ belt: 'white', stripes: 4 }));

    rerender({ rank: { belt: 'blue', stripes: 0 } });
    expect(currentLinks()).toEqual(rankIconLinks({ belt: 'blue', stripes: 0 }));

    rerender({ rank: null });
    expect(currentLinks()).toEqual(DEFAULT_ICON_LINKS);
  });
});

// index.html sets the links itself before the app has loaded. That script cannot import the
// domain function, so these tests run it and hold it to the same answers.
describe('the script in index.html that runs before the app loads', () => {
  const script = /<script>([\s\S]*?)<\/script>/.exec(INDEX_HTML)?.[1] ?? '';

  function runWith(stored: string | null): IconLinks {
    if (stored !== null) window.localStorage.setItem(STORAGE_KEY, stored);
    new Function(script)();
    return currentLinks();
  }

  it('is there', () => {
    expect(script).toContain('localStorage');
  });

  it('agrees with rankIconLinks for every rank', () => {
    for (const belt of BELTS) {
      for (let stripes = 0; stripes <= maxStripes(belt); stripes += 1) {
        expect(runWith(JSON.stringify({ rank: { belt, stripes } }))).toEqual(
          rankIconLinks({ belt, stripes }),
        );
      }
    }
  });

  it.each([
    ['nothing stored', null],
    ['no rank yet', JSON.stringify({ rank: null, promotions: [] })],
    ['text that is not JSON', '{not json'],
    ['a stored null', 'null'],
    ['a stored number', '7'],
    ['a rank that is not an object', JSON.stringify({ rank: 'blue' })],
    ['an unknown belt', JSON.stringify({ rank: { belt: 'red', stripes: 1 } })],
    ['a belt named after a built-in property', JSON.stringify({ rank: { belt: 'constructor', stripes: 0 } })],
    ['a belt that is a path', JSON.stringify({ rank: { belt: '../white', stripes: 0 } })],
    ['too many stripes', JSON.stringify({ rank: { belt: 'brown', stripes: 5 } })],
    ['too many degrees', JSON.stringify({ rank: { belt: 'black', stripes: 7 } })],
    ['negative stripes', JSON.stringify({ rank: { belt: 'blue', stripes: -1 } })],
    ['part of a stripe', JSON.stringify({ rank: { belt: 'blue', stripes: 1.5 } })],
    ['stripes as text', JSON.stringify({ rank: { belt: 'blue', stripes: '2' } })],
    ['no stripes at all', JSON.stringify({ rank: { belt: 'blue' } })],
  ])('keeps the default icons and does not throw for %s', (_name, stored) => {
    expect(runWith(stored)).toEqual(DEFAULT_ICON_LINKS);
  });

  it('keeps the default icons when storage cannot be read', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')!;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('storage is switched off');
      },
    });
    try {
      expect(runWith(null)).toEqual(DEFAULT_ICON_LINKS);
    } finally {
      Object.defineProperty(globalThis, 'localStorage', original);
    }
  });
});
