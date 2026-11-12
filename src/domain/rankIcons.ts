import { isValidRank } from './rank';
import type { Rank } from './types';

/** The files the page's `<link>` elements point at, as paths from the site root. */
export interface IconLinks {
  /** The web app manifest, which names the home-screen icons for Android and desktop. */
  manifest: string;
  /** The home-screen icon iOS reads when the app is added to the home screen. */
  appleTouchIcon: string;
  /** The browser tab icon. */
  favicon: string;
}

/** Used until a rank is set. These must match the `<link>` elements written in `index.html`. */
export const DEFAULT_ICON_LINKS: IconLinks = {
  manifest: '/manifest.webmanifest',
  appleTouchIcon: '/apple-touch-icon.png',
  favicon: '/favicon.svg',
};

/**
 * The icon files for a rank. `scripts/generate-icons.mjs` writes one set per rank into
 * `public/ranks/` under these names. Anything that is not a real rank gets the default icons,
 * so the page never links to a file that does not exist.
 */
export function rankIconLinks(rank: Rank | null): IconLinks {
  if (!rank || !isValidRank(rank)) return DEFAULT_ICON_LINKS;
  const base = `/ranks/${rank.belt}-${rank.stripes}`;
  return {
    manifest: `${base}.webmanifest`,
    appleTouchIcon: `${base}-180.png`,
    favicon: `${base}.svg`,
  };
}
