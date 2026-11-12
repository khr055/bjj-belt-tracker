import { useEffect } from 'react';
import { rankIconLinks, type IconLinks } from '../domain/rankIcons';
import type { Rank } from '../domain/types';

const SELECTORS: Record<keyof IconLinks, string> = {
  manifest: 'link[rel="manifest"]',
  appleTouchIcon: 'link[rel="apple-touch-icon"]',
  favicon: 'link[rel="icon"]',
};

/**
 * Points the page's manifest, home-screen icon and tab icon at the files for a rank, or at the
 * defaults when there is none. Only the links already in the page are changed; a page without
 * them is left alone.
 */
export function applyRankIcons(rank: Rank | null, doc: Document = document): void {
  const links = rankIconLinks(rank);
  for (const key of Object.keys(SELECTORS) as (keyof IconLinks)[]) {
    const link = doc.head.querySelector(SELECTORS[key]);
    // Writing the same address again would make some browsers fetch the file again.
    if (link && link.getAttribute('href') !== links[key]) link.setAttribute('href', links[key]);
  }
}

/**
 * Keeps the tab icon, and the icon a new install would get, in step with the current rank.
 * `index.html` does the same once before the app loads, so the first paint is already right.
 */
export function useRankIcons(rank: Rank | null): void {
  useEffect(() => {
    applyRankIcons(rank);
  }, [rank]);
}
